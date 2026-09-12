/**
 * Hypothesis-set estimation: instead of thresholding temperatures, enumerate candidate
 * burning sets, score each against the trusted readings, and keep every hypothesis that
 * explains the data almost as well as the best. When the surviving sensors cannot
 * separate two fire states, both survive — ambiguity is reported, not hidden.
 *
 * Scoring drops the k largest residuals before averaging: up to k sensors may still be
 * lying undetected, so the estimator tolerates a sparse corruption of size k without
 * knowing which entries are corrupt (the Defense brief's y = Hx + a framing).
 */
import { edgeMap } from '../shared/plan';
import { forward } from './physics';
import type { Reading, SpaceId, StructurePlan } from '../shared/types';

const MAX_CANDIDATES = 64;
const HOT_READING_C = 200;
// Score against a short forward rollout, not the steady state: the steady pattern
// predicts neighbors at equilibrium temps they have not reached yet, which made every
// fire hypothesis look worse than "no fire" for the first ten ticks (probed). Three
// steps is enough for a hypothesis's generation to visibly reach its neighbors, which is
// what separates "S3 burns" from "S3's sensor lies" once anything nearby reports.
const ROLLOUT_TICKS = 3;

const keyOf = (s: Set<SpaceId>): string => [...s].sort().join(',');

/**
 * Enumerate candidate burning sets around the previous belief: the previous set, grow by
 * one neighbor, shrink by one space, any single trusted-hot space, and each trusted-hot
 * space with each one of its neighbors. Fire grows to neighbors; the space is small.
 */
export function candidates(
  plan: StructurePlan,
  prevBurning: Set<SpaceId>,
  trustedHot: SpaceId[],
): Set<SpaceId>[] {
  const edges = edgeMap(plan);
  const neighborsOf = (id: SpaceId): SpaceId[] => (edges.get(id) ?? []).map((e) => e.b);
  const out = new Map<string, Set<SpaceId>>();
  const add = (s: Set<SpaceId>): void => {
    const k = keyOf(s);
    if (!out.has(k)) out.set(k, s);
  };

  add(new Set(prevBurning));
  for (const b of prevBurning) {
    for (const n of neighborsOf(b)) add(new Set([...prevBurning, n]));
  }
  for (const b of prevBurning) {
    const minus = new Set(prevBurning);
    minus.delete(b);
    add(minus);
  }
  for (const h of trustedHot) {
    add(new Set([h]));
    for (const n of neighborsOf(h)) {
      add(new Set([h, n]));
      // The warmth at h may be LEAKAGE from a fire next door — possibly in a space with
      // no sensor at all. The neighbor alone must be a candidate.
      add(new Set([n]));
    }
  }

  const prevSize = prevBurning.size;
  return [...out.values()]
    .sort((a, b) => Math.abs(a.size - prevSize) - Math.abs(b.size - prevSize) || keyOf(a).localeCompare(keyOf(b)))
    .slice(0, MAX_CANDIDATES);
}

/**
 * Predicted temps for a hypothesis, rolled `steps` ticks forward from a PAST estimate up
 * to the present. Rolling from t-steps to t (rather than past the present) keeps a
 * model-exact hypothesis at residual ~0 while still accumulating enough generation that
 * a fire's leakage into neighboring readings separates it from "that sensor lies".
 */
export function predict(
  plan: StructurePlan,
  hypothesis: Set<SpaceId>,
  fromEstimate: Record<SpaceId, number>,
  steps = ROLLOUT_TICKS,
): Record<SpaceId, number> {
  let temps = fromEstimate;
  for (let i = 0; i < Math.max(1, steps); i++) temps = forward(plan, temps, hypothesis);
  return temps;
}

/**
 * Mean absolute residual over trusted readings, after dropping up to k residuals — the
 * sparse-corruption tolerance. Lower is better.
 *
 * Only DOWNWARD contradictions are droppable (sensor reads colder than the hypothesis
 * predicts): every mode in the failure model — blind, freeze, saturate, flashover —
 * pushes readings down or away, never up. A sensor reading HOTTER than a hypothesis
 * allows is never excusable as a liar, so the "no fire" hypothesis cannot silently
 * discard the one sensor that sees the fire.
 */
export type Score = {
  /** Mean residual after tolerated drops — the primary criterion. */
  s: number;
  /** Mean residual with NO drops. Tiebreak: near-equal hypotheses resolve toward the
   * one that explains the data without invoking any liar at all. */
  full: number;
};

export function score(
  plan: StructurePlan,
  hypothesis: Set<SpaceId>,
  trusted: Reading[],
  fromEstimate: Record<SpaceId, number>,
  k: number,
  steps = ROLLOUT_TICKS,
): Score {
  const predicted = predict(plan, hypothesis, fromEstimate, steps);
  const residuals = trusted
    .map((r) => {
      const p = predicted[r.spaceId] ?? plan.ambient;
      return { r: Math.abs(p - r.temp), droppable: p > r.temp };
    })
    .sort((a, b) => b.r - a.r);
  const kept: number[] = [];
  let drops = 0;
  for (const [i, x] of residuals.entries()) {
    const remaining = residuals.length - i;
    if (x.droppable && drops < k && kept.length + remaining > 1) {
      drops++;
      continue;
    }
    kept.push(x.r);
  }
  const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return { s: mean(kept), full: mean(residuals.map((x) => x.r)) };
}

export const hotSpaces = (trusted: Reading[]): SpaceId[] => [
  ...new Set(trusted.filter((r) => r.temp > HOT_READING_C).map((r) => r.spaceId)),
];
