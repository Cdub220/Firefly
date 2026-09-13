/**
 * Physical consistency check: which readings can be trusted this tick, and which sensors
 * are lying, with a reason. The rules are applied in order, each removing sensors from
 * the trusted pool, so later rules judge "neighbors" using only readings that survived
 * the earlier rules.
 */
import { edgeMap } from '../shared/plan';
import { FLAME_TEMP, maxDrop, maxRise, SIGMA_C } from './physics';
import type { Observation, Reading, SensorId, SpaceId, StructurePlan } from '../shared/types';

export type Reason =
  | 'stale'
  | 'frozen'
  | 'impossible-rise'
  | 'impossible-drop'
  | 'cold-in-hot-neighborhood'
  | 'no-heat-path';

export type Suspect = { sensorId: SensorId; reason: Reason };

/** Per-sensor reading history, newest last. Owned by the brain closure; reset clears it. */
export type SensorHistory = Map<SensorId, Array<{ t: number; temp: number; spaceId: SpaceId }>>;

const STALE_LAG = 2; // reading.t < obs.t - 2 => stale
const FROZEN_TICKS = 6; // unchanged this many consecutive ticks
const FROZEN_EPS_C = 0.05; // "unchanged" means |delta| below this
const FROZEN_NEIGHBOR_MOVE_C = 15; // while the median neighbor moved more than this
const COLD_MARGIN_C = 10; // "cold" = below ambient + 10
const HOT_NEIGHBOR_C = 250; // neighborhood is "hot" when trusted neighbors read above this
const PATHLESS_HOT_C = 200; // a reading this hot needs a heat path...
const PATH_WARM_C = 60; // ...meaning something within 2 edges reading above this
const NO_PATH_GRACE_TICKS = 3; // the initial fire has to start somewhere
const HISTORY_CAP = FROZEN_TICKS + 4;

/**
 * Moving sensors. A drone-borne sensor changes spaceId when the drone flies, so its own
 * history is not a record of one place: the rate-of-change rules judge every reading
 * against the brain's estimate for the space it now reports from (prevEstimate), never
 * against the sensor's own previous value, and the frozen rule only looks at the part of
 * the history since the sensor last moved. A fixed sensor is part of the structure and
 * cannot move: if its spaceId differs from its previous entry it is judged against its
 * own last reading (a sensor does not teleport into a hotter room).
 *
 * First observations. A space that no sensor reported from last tick has an estimate
 * that is a hypothesis, not a measurement: the physics rollout of whichever explanation
 * scored best. The first reading to arrive there (a scout flying into an unsensed room)
 * is what settles the hypothesis, so it cannot be judged an impossible rise or drop
 * against the guess it is there to test. The same allowance already applies to unsensed
 * NEIGHBOURS in the bounds below, and to every space in the first ticks. Stale, frozen,
 * cold-in-hot-neighbourhood and no-heat-path still apply to it.
 */
const ownPrev = (history: SensorHistory, r: Reading): { t: number; temp: number; spaceId: SpaceId } | undefined => {
  const h = history.get(r.sensorId) ?? [];
  return h[h.length - 2]; // the last entry is this tick's reading (updateHistory runs first)
};
const movedFixed = (history: SensorHistory, r: Reading): { t: number; temp: number; spaceId: SpaceId } | undefined => {
  const p = ownPrev(history, r);
  return r.source === 'fixed' && p !== undefined && p.spaceId !== r.spaceId ? p : undefined;
};

/** Append this tick's readings to the history. Call once per tick, before checking. */
export function updateHistory(history: SensorHistory, obs: Observation): void {
  for (const r of obs.readings) {
    const h = history.get(r.sensorId) ?? [];
    h.push({ t: obs.t, temp: r.temp, spaceId: r.spaceId });
    while (h.length > HISTORY_CAP) h.shift();
    history.set(r.sensorId, h);
  }
}

export function checkConsistency(
  plan: StructurePlan,
  obs: Observation,
  prevEstimate: Record<SpaceId, number>,
  history: SensorHistory,
): { trusted: Reading[]; suspect: Suspect[] } {
  const edges = edgeMap(plan);
  const neighborsOf = (id: SpaceId): SpaceId[] => (edges.get(id) ?? []).map((e) => e.b);
  const suspect: Suspect[] = [];
  let trusted = [...obs.readings];
  const drop = (ids: Set<SensorId>, reason: Reason): void => {
    for (const id of ids) suspect.push({ sensorId: id, reason });
    trusted = trusted.filter((r) => !ids.has(r.sensorId));
  };

  // 1. stale: the reading itself admits it is old.
  drop(new Set(trusted.filter((r) => r.t < obs.t - STALE_LAG).map((r) => r.sensorId)), 'stale');

  // 2. frozen: flat for FROZEN_TICKS while the median trusted neighbor moved. Catches
  // freeze corruption that fakes a current timestamp.
  const trustedBySpace = new Map<SpaceId, Reading[]>();
  for (const r of trusted) {
    (trustedBySpace.get(r.spaceId) ?? trustedBySpace.set(r.spaceId, []).get(r.spaceId)!).push(r);
  }
  const spaceMoveOverWindow = (spaceId: SpaceId): number | undefined => {
    // Movement of this space's trusted sensors over the frozen window (max over sensors).
    const rs = trustedBySpace.get(spaceId);
    if (!rs || rs.length === 0) return undefined;
    let best: number | undefined;
    for (const r of rs) {
      const h = history.get(r.sensorId) ?? [];
      // Only entries taken in the space the sensor now reports from: a drone's flight is not
      // a temperature change in either room.
      const inWindow = h.filter((x) => x.t >= obs.t - FROZEN_TICKS && x.spaceId === r.spaceId);
      if (inWindow.length < 2) continue;
      const move = Math.abs(inWindow[inWindow.length - 1]!.temp - inWindow[0]!.temp);
      best = best === undefined ? move : Math.max(best, move);
    }
    return best;
  };
  const frozenIds = new Set<SensorId>();
  for (const r of trusted) {
    const h = history.get(r.sensorId) ?? [];
    const window = h.filter((x) => x.t >= obs.t - FROZEN_TICKS);
    if (window.length < FROZEN_TICKS) continue;
    // A sensor that moved within the window is not frozen: the streak restarts at the move.
    // A drone that has sat still for the whole window IS subject to the rule (a stuck
    // drone lies like a stuck sensor).
    if (window.some((x) => x.spaceId !== r.spaceId)) continue;
    const flat = window.every((x, i) => i === 0 || Math.abs(x.temp - window[i - 1]!.temp) < FROZEN_EPS_C);
    if (!flat) continue;
    const moves = neighborsOf(r.spaceId)
      .map((n) => spaceMoveOverWindow(n))
      .filter((m): m is number => m !== undefined)
      .sort((a, b) => a - b);
    if (moves.length === 0) continue;
    const median = moves[Math.floor(moves.length / 2)]!;
    if (median > FROZEN_NEIGHBOR_MOVE_C) frozenIds.add(r.sensorId);
  }
  drop(frozenIds, 'frozen');

  // 3. impossible-rise: hotter than physics allows from where we last believed it was.
  // Skipped in the first ticks for the same reason as no-heat-path: the estimator starts
  // from ambient, and a fire that predates it would read as an impossible jump.
  //
  // The bound is computed from the neighbors' temperatures, and a neighbor with no
  // trusted reading this tick is only an ESTIMATE: a space whose sensor died while it
  // burns is routinely hotter than the physics rollout says. A rise cannot be called
  // impossible on the strength of a neighbor the brain cannot see, so such a neighbor is
  // allowed to be anywhere up to flame temperature for the rise bound (and down to
  // ambient for the drop bound). Only warm unsensed spaces get the allowance; an
  // unsensed space the physics puts at ambient with cold surroundings is not a hidden fire.
  const sensedNow = new Set(trusted.map((r) => r.spaceId));
  const observedLastTick = new Set<SpaceId>();
  for (const h of history.values()) {
    for (const x of h) if (x.t === obs.t - 1) observedLastTick.add(x.spaceId);
  }
  const firstObservation = (r: Reading): boolean => !observedLastTick.has(r.spaceId) && movedFixed(history, r) === undefined;
  const hiBound: Record<SpaceId, number> = {};
  const loBound: Record<SpaceId, number> = {};
  for (const s of plan.spaces) {
    const est = prevEstimate[s.id] ?? plan.ambient;
    const unseenWarm = !sensedNow.has(s.id) && est > PATH_WARM_C;
    hiBound[s.id] = unseenWarm ? Math.max(est, FLAME_TEMP) : est;
    loBound[s.id] = unseenWarm ? Math.min(est, plan.ambient) : est;
  }
  if (obs.t > NO_PATH_GRACE_TICKS) {
    drop(
      new Set(
        trusted
          .filter((r) => {
            const p = movedFixed(history, r);
            if (p !== undefined) return r.temp - p.temp > maxRise(plan, r.spaceId, { ...hiBound, [r.spaceId]: p.temp }) + 3 * SIGMA_C;
            if (firstObservation(r)) return false;
            return r.temp - (prevEstimate[r.spaceId] ?? plan.ambient) > maxRise(plan, r.spaceId, hiBound) + 3 * SIGMA_C;
          })
          .map((r) => r.sensorId),
      ),
      'impossible-rise',
    );
  }

  // 3b. impossible-drop: colder than the most aggressive cooling could make it. This is
  // beyond the prompt's five rules, kept from CP1: a smoke-blinded sensor drops to
  // ambient in one tick with a current timestamp, and no other rule sees it until the
  // neighbors heat up.
  drop(
    new Set(
      trusted
        .filter((r) => {
          const p = movedFixed(history, r);
          if (p !== undefined) return p.temp - r.temp > maxDrop(plan, r.spaceId, { ...loBound, [r.spaceId]: p.temp }) + 3 * SIGMA_C;
          if (firstObservation(r)) return false;
          return (prevEstimate[r.spaceId] ?? plan.ambient) - r.temp > maxDrop(plan, r.spaceId, loBound) + 3 * SIGMA_C;
        })
        .map((r) => r.sensorId),
    ),
    'impossible-drop',
  );

  // 4. cold-in-hot-neighborhood: heat cannot fail to cross an open door for long.
  const trustedSpaceTemp = new Map<SpaceId, number>();
  for (const r of trusted) {
    trustedSpaceTemp.set(r.spaceId, Math.max(trustedSpaceTemp.get(r.spaceId) ?? -Infinity, r.temp));
  }
  const coldIds = new Set<SensorId>();
  for (const r of trusted) {
    if (r.temp >= plan.ambient + COLD_MARGIN_C) continue;
    const neighborEdges = edges.get(r.spaceId) ?? [];
    const withReadings = neighborEdges.filter((e) => trustedSpaceTemp.has(e.b));
    if (withReadings.length === 0) continue;
    const allHot = withReadings.every((e) => trustedSpaceTemp.get(e.b)! > HOT_NEIGHBOR_C);
    const openDoorToHot = withReadings.some(
      (e) => (e.kind === 'door' || e.kind === 'passage') && trustedSpaceTemp.get(e.b)! > HOT_NEIGHBOR_C,
    );
    if (allHot && openDoorToHot) coldIds.add(r.sensorId);
  }
  drop(coldIds, 'cold-in-hot-neighborhood');

  // 5. no-heat-path: fire cannot appear in an isolated space out of nothing.
  if (obs.t > NO_PATH_GRACE_TICKS) {
    const warmWithinTwo = (id: SpaceId): boolean => {
      const seen = new Set<SpaceId>([id]);
      let ring = neighborsOf(id);
      for (let hop = 0; hop < 2; hop++) {
        const next: SpaceId[] = [];
        for (const n of ring) {
          if (seen.has(n)) continue;
          seen.add(n);
          const t = trustedSpaceTemp.get(n);
          if (t !== undefined && t > PATH_WARM_C) return true;
          next.push(...neighborsOf(n));
        }
        ring = next;
      }
      return false;
    };
    drop(
      new Set(
        trusted
          .filter(
            (r) =>
              r.temp > PATHLESS_HOT_C &&
              (prevEstimate[r.spaceId] ?? plan.ambient) < PATH_WARM_C &&
              !warmWithinTwo(r.spaceId),
          )
          .map((r) => r.sensorId),
      ),
      'no-heat-path',
    );
  }

  return { trusted, suspect };
}
