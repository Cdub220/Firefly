/**
 * src/brain — owned by Dean.
 *
 * Estimation and allocation. Sees ONLY Observation objects. Never truth, never the
 * corruption pattern. Enforced by lint: this directory cannot import src/world,
 * src/corruption, src/eval, src/ui or src/loop.
 *
 * v0.2 — predictor-corrector with physics as the trusted reference:
 *   1. checkConsistency judges every reading against heat physics and history, yielding
 *      trusted readings and suspect sensors with reasons.
 *   2. Estimate: spaces with a trusted reading take it; every other space takes one
 *      forward() step of the heat model from the previous estimate — the physics
 *      predicts, the surviving sensors correct.
 *   3. burningSet thresholds the estimate (hypothesis sets replace this in CP2 prompt 2).
 *   4. confidence: fraction of spaces backed by a trusted reading within one edge, times
 *      0.8 per suspect sensor.
 */
import { makeRng, type Rng } from '../shared/rng';
import { edgeMap } from '../shared/plan';
import { forward } from './physics';
import { checkConsistency, updateHistory, type SensorHistory } from './consistency';
import type { Belief, Brain, BrainConfig, Command, Observation, SpaceId } from '../shared/types';

const BURN_THRESHOLD_C = 200;
const SUSPECT_PENALTY = 0.8; // confidence multiplier per distrusted sensor

export function createBrain(config: BrainConfig): Brain {
  let rng: Rng = makeRng(config.seed).fork('brain');
  void rng; // reserved for hedging / tie-breaks. TODO(Dean).
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);
  const edges = edgeMap(config.plan);
  const neighborsOf = new Map<SpaceId, SpaceId[]>(
    spaceIds.map((id) => [id, (edges.get(id) ?? []).map((e) => e.b)]),
  );

  let history: SensorHistory = new Map();
  let prevEstimate: Record<SpaceId, number> = {};
  let prevBurning = new Set<SpaceId>();
  const init = (): void => {
    history = new Map();
    prevEstimate = {};
    for (const id of spaceIds) prevEstimate[id] = config.plan.ambient;
    prevBurning = new Set();
  };
  init();

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      updateHistory(history, obs);
      const { trusted, suspect } = checkConsistency(config.plan, obs, prevEstimate, history);

      // Predictor: one physics step from what we believed last tick.
      const predicted = forward(config.plan, prevEstimate, prevBurning);

      // Corrector: trusted readings override the prediction where they exist.
      const direct = new Map<SpaceId, { sum: number; n: number }>();
      for (const r of trusted) {
        const acc = direct.get(r.spaceId) ?? { sum: 0, n: 0 };
        direct.set(r.spaceId, { sum: acc.sum + r.temp, n: acc.n + 1 });
      }
      const estimate: Record<SpaceId, number> = {};
      for (const id of spaceIds) {
        const d = direct.get(id);
        estimate[id] = d ? d.sum / d.n : predicted[id]!;
      }

      const burningSet = spaceIds.filter((id) => estimate[id]! > BURN_THRESHOLD_C);

      const backed = spaceIds.filter(
        (id) => direct.has(id) || (neighborsOf.get(id) ?? []).some((n) => direct.has(n)),
      ).length;
      const confidence =
        (spaceIds.length ? backed / spaceIds.length : 0) * Math.pow(SUSPECT_PENALTY, suspect.length);

      prevEstimate = estimate;
      prevBurning = new Set(burningSet);

      const belief: Belief = {
        estimate,
        burningSet,
        ambiguous: [],
        suspectSensors: suspect.map((s) => s.sensorId).sort(),
        confidence,
      };
      return { belief, commands: [] };
    },
    reset(): void {
      rng = makeRng(config.seed).fork('brain');
      init();
    },
  };
}
