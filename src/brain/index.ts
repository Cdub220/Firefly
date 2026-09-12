/**
 * src/brain — owned by Dean.
 *
 * Estimation and allocation. Sees ONLY Observation objects. Never truth, never the
 * corruption pattern. Enforced by lint: this directory cannot import src/world,
 * src/corruption, src/eval, src/ui or src/loop.
 *
 * v1 — the real estimator:
 *   1. checkConsistency judges every reading against heat physics and history, yielding
 *      trusted readings and suspect sensors with reasons.
 *   2. Hypothesis sets: enumerate candidate burning sets around the previous belief,
 *      score each against the trusted readings (dropping the k largest residuals — up to
 *      k sensors may still be lying undetected), and keep every hypothesis within
 *      tolerance of the best.
 *   3. burningSet = the intersection of kept hypotheses (certainly burning). Spaces in
 *      some-but-not-all kept hypotheses are reported in `ambiguous`, grouped into
 *      connected components. Confidence = 1 / kept, times the consistency penalty.
 *      Two equally good explanations means confidence 0.5. That is what honest means.
 */
import { makeRng, type Rng } from '../shared/rng';
import { edgeMap } from '../shared/plan';
import { candidates, hotSpaces, predict, score } from './hypotheses';
import { checkConsistency, updateHistory, type SensorHistory } from './consistency';
import type { Belief, Brain, BrainConfig, Command, Observation, SpaceId } from '../shared/types';

// Default tolerance for undetected liars. NOT the prompt's 2: with one sensor per space
// (every current plan), k=2 lets the "no fire" hypothesis silently discard both sensors
// that contradict it — k must stay below the per-space sensor redundancy or the
// estimator is formally blind to small fires. Plans with doubled-up sensors can raise it
// via BrainConfig.k.
const DEFAULT_K = 1;
const SUSPECT_PENALTY = 0.8; // confidence multiplier per distrusted sensor
const TOLERANCE_FLOOR_C = 8; // hypotheses within max(8, 15% of best) of the best survive
const TOLERANCE_FRAC = 0.15;
const MIN_CONFIDENCE = 0.05;

export function createBrain(config: BrainConfig): Brain {
  let rng: Rng = makeRng(config.seed).fork('brain');
  void rng; // reserved for hedging / tie-breaks. TODO(Dean).
  const k = config.k ?? DEFAULT_K;
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);
  const edges = edgeMap(config.plan);
  const neighborsOf = new Map<SpaceId, SpaceId[]>(
    spaceIds.map((id) => [id, (edges.get(id) ?? []).map((e) => e.b)]),
  );

  const ROLLOUT = 3; // score hypotheses over this many ticks of history

  let history: SensorHistory = new Map();
  let prevEstimate: Record<SpaceId, number> = {};
  let estHistory: Record<SpaceId, number>[] = []; // estimates of the last ROLLOUT ticks
  let prevBurning = new Set<SpaceId>();
  const init = (): void => {
    history = new Map();
    prevEstimate = {};
    for (const id of spaceIds) prevEstimate[id] = config.plan.ambient;
    estHistory = [];
    prevBurning = new Set();
  };
  init();

  /** Group ambiguous spaces into connected components over plan edges. */
  const components = (ids: Set<SpaceId>): SpaceId[][] => {
    const seen = new Set<SpaceId>();
    const out: SpaceId[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const group: SpaceId[] = [];
      const queue = [id];
      seen.add(id);
      while (queue.length) {
        const cur = queue.pop()!;
        group.push(cur);
        for (const n of neighborsOf.get(cur) ?? []) {
          if (ids.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      out.push(group.sort());
    }
    return out.sort((a, b) => a[0]!.localeCompare(b[0]!));
  };

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      updateHistory(history, obs);
      const { trusted, suspect } = checkConsistency(config.plan, obs, prevEstimate, history);

      // Seed candidates from hot READINGS and hot ESTIMATES: a fire whose sensors died
      // must stay in the pool — the estimate remembers it even when no reading does.
      const hotSeeds = [
        ...new Set([...hotSpaces(trusted), ...spaceIds.filter((id) => prevEstimate[id]! > 200)]),
      ];
      // Score each candidate by rolling physics from the estimate of ROLLOUT ticks ago
      // to the present and comparing against the current readings. Ties resolve toward
      // the hypothesis that needs no liars (full), then the smaller claim.
      const from = estHistory[0] ?? prevEstimate;
      const steps = Math.max(1, estHistory.length);
      const sets = candidates(config.plan, prevBurning, hotSeeds);
      const scored = sets
        .map((set) => ({ set, ...score(config.plan, set, trusted, from, k, steps) }))
        .sort((a, b) => a.s - b.s || a.full - b.full || a.set.size - b.set.size);
      const best = scored[0]!;
      const tolerance = Math.max(TOLERANCE_FLOOR_C, TOLERANCE_FRAC * best.s);
      const kept = scored.filter((x) => x.s <= best.s + tolerance);

      // Certainly burning: what every surviving explanation agrees on. If they agree on
      // nothing (disjoint explanations, or "no fire" among the survivors), report the
      // BEST explanation rather than the empty set: naming no fire while one burns is
      // the one unacceptable failure mode, and the alternatives stay visible in
      // `ambiguous` with confidence lowered accordingly.
      let burning = kept
        .map((x) => x.set)
        .reduce((acc, s) => new Set([...acc].filter((id) => s.has(id))));
      if (burning.size === 0) burning = best.set;

      const union = new Set<SpaceId>(kept.flatMap((x) => [...x.set]));
      const contested = new Set<SpaceId>([...union].filter((id) => !burning.has(id)));
      const ambiguous = kept.length > 1 ? components(contested) : [];

      const confidence = Math.min(
        1,
        Math.max(MIN_CONFIDENCE, (1 / kept.length) * Math.pow(SUSPECT_PENALTY, suspect.length)),
      );

      // Estimate: trusted readings where present; the best hypothesis's physics
      // elsewhere (one step from last tick's estimate — the current-tick prediction).
      const predicted = predict(config.plan, best.set, prevEstimate, 1);
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

      // Grow next tick's candidates from the best explanation, not the (possibly
      // empty-intersection) reported set: the candidate generator needs a fire to grow.
      prevEstimate = estimate;
      estHistory.push(estimate);
      while (estHistory.length > ROLLOUT) estHistory.shift();
      prevBurning = new Set(best.set);

      const belief: Belief = {
        estimate,
        burningSet: [...burning].sort(),
        ambiguous,
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
