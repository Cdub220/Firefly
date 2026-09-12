/**
 * src/brain — owned by Dean.
 *
 * Estimation and allocation. Sees ONLY Observation objects. Never truth, never the
 * corruption pattern. Enforced by lint: this directory cannot import src/world,
 * src/corruption, src/eval, src/ui or src/loop.
 *
 * v0.1 — minimal honesty, deliberately crude (the real estimator is checkpoint 2):
 *   - A sensor is SUSPECT when its reading is stale (t older than obs.t - 3), when its
 *     value has sat still for 8 ticks while a neighboring space's reading moved by more
 *     than 20C, or when it ever dropped more than 100C in a single tick (fires do not
 *     cool like that; smoke-blinded cameras read that way). Suspect sensors are excluded
 *     from the estimate.
 *   - A space with no trusted reading is estimated as the mean of trusted neighbor
 *     estimates (plan edges), falling back to ambient.
 *   - confidence = trusted readings / total readings, halved when any believed-burning
 *     space has no trusted reading. It must never report 1.0 while trusting a frozen
 *     sensor; that is the whole point.
 */
import { makeRng, type Rng } from '../shared/rng';
import { edgeMap } from '../shared/plan';
import type { Belief, Brain, BrainConfig, Command, Observation, SensorId, SpaceId } from '../shared/types';

const BURN_THRESHOLD_C = 200;
const STALE_AGE_TICKS = 3; // reading older than obs.t - 3 => suspect
const STUCK_TICKS = 8; // unchanged this long while a neighbor moves => suspect
const CHANGE_EPS_C = 0.1; // a reading "changed" when it moved more than this
const NEIGHBOR_MOVE_C = 20; // a neighbor "moved" when its space temp changed this much
const MAX_CREDIBLE_DROP_C = 100; // a one-tick drop beyond this is physically implausible
const HISTORY_TICKS = STUCK_TICKS + 2;

export function createBrain(config: BrainConfig): Brain {
  let rng: Rng = makeRng(config.seed).fork('brain');
  void rng; // reserved for hedging / tie-breaks. TODO(Dean).
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);
  const edges = edgeMap(config.plan);
  const neighborsOf = new Map<SpaceId, SpaceId[]>(
    spaceIds.map((id) => [id, (edges.get(id) ?? []).map((e) => e.b)]),
  );

  // Per-sensor and per-space memory across ticks. reset() clears it.
  let lastValue = new Map<SensorId, { temp: number; spaceId: SpaceId }>();
  let lastChangeTick = new Map<SensorId, number>();
  let spaceHistory = new Map<SpaceId, Array<{ t: number; temp: number }>>();
  let implausible = new Set<SensorId>(); // once a sensor did the impossible, distrust it

  const clear = (): void => {
    lastValue = new Map();
    lastChangeTick = new Map();
    spaceHistory = new Map();
    implausible = new Set();
  };

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      // Update per-sensor change tracking.
      for (const r of obs.readings) {
        const prev = lastValue.get(r.sensorId);
        if (prev === undefined || Math.abs(r.temp - prev.temp) > CHANGE_EPS_C) {
          lastChangeTick.set(r.sensorId, obs.t);
        }
        // A drone sensor that moved to another space may legitimately read far colder;
        // the implausible-drop rule only applies to a sensor still in the same space.
        if (prev !== undefined && prev.spaceId === r.spaceId && prev.temp - r.temp > MAX_CREDIBLE_DROP_C) {
          implausible.add(r.sensorId);
        }
        lastValue.set(r.sensorId, { temp: r.temp, spaceId: r.spaceId });
      }

      // Per-space temp history (mean of this tick's readings per space), for the
      // "neighbor moved while this sensor sat still" check.
      const sums = new Map<SpaceId, { sum: number; n: number }>();
      for (const r of obs.readings) {
        const acc = sums.get(r.spaceId) ?? { sum: 0, n: 0 };
        sums.set(r.spaceId, { sum: acc.sum + r.temp, n: acc.n + 1 });
      }
      const tempNow = new Map<SpaceId, number>([...sums].map(([id, a]) => [id, a.sum / a.n]));
      for (const [spaceId, temp] of tempNow) {
        const hist = spaceHistory.get(spaceId) ?? [];
        hist.push({ t: obs.t, temp });
        while (hist.length > 0 && hist[0]!.t < obs.t - HISTORY_TICKS) hist.shift();
        spaceHistory.set(spaceId, hist);
      }
      const movedSince = (spaceId: SpaceId, sinceTick: number): boolean => {
        const hist = spaceHistory.get(spaceId);
        const now = tempNow.get(spaceId);
        if (!hist || now === undefined) return false;
        const then = hist.find((h) => h.t >= sinceTick);
        return then !== undefined && Math.abs(now - then.temp) > NEIGHBOR_MOVE_C;
      };

      // Trust judgment per reading.
      const suspects = new Set<SensorId>();
      for (const r of obs.readings) {
        const stale = r.t < obs.t - STALE_AGE_TICKS;
        const changed = lastChangeTick.get(r.sensorId) ?? obs.t;
        const stuck =
          obs.t - changed >= STUCK_TICKS &&
          (neighborsOf.get(r.spaceId) ?? []).some((n) => movedSince(n, changed));
        if (stale || stuck || implausible.has(r.sensorId)) suspects.add(r.sensorId);
      }
      const trusted = obs.readings.filter((r) => !suspects.has(r.sensorId));

      // Estimate: trusted readings first, then trusted-neighbor mean, then ambient.
      const direct = new Map<SpaceId, number>();
      for (const r of trusted) {
        const xs = trusted.filter((x) => x.spaceId === r.spaceId).map((x) => x.temp);
        direct.set(r.spaceId, xs.reduce((a, b) => a + b, 0) / xs.length);
      }
      const estimate: Record<SpaceId, number> = {};
      for (const id of spaceIds) {
        const d = direct.get(id);
        if (d !== undefined) {
          estimate[id] = d;
          continue;
        }
        const near = (neighborsOf.get(id) ?? [])
          .map((n) => direct.get(n))
          .filter((v): v is number => v !== undefined);
        estimate[id] = near.length ? near.reduce((a, b) => a + b, 0) / near.length : config.plan.ambient;
      }

      const burningSet = spaceIds.filter((id) => (estimate[id] ?? 0) > BURN_THRESHOLD_C);
      const blindSpot = burningSet.some((id) => !direct.has(id));
      const confidence =
        (obs.readings.length ? trusted.length / obs.readings.length : 0) * (blindSpot ? 0.5 : 1);

      const belief: Belief = {
        estimate,
        burningSet,
        ambiguous: [],
        suspectSensors: [...suspects].sort(),
        confidence,
      };
      return { belief, commands: [] };
    },
    reset(): void {
      rng = makeRng(config.seed).fork('brain');
      clear();
    },
  };
}
