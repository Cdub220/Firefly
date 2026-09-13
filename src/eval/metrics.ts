/**
 * src/eval — owned by Dean.
 *
 * The four metrics the Defense brief names (false certainty, estimation error, time to
 * recovery, computation cost) plus the two operational ones (wrong dispatch, ambiguity
 * coverage) and the calibration numbers (Brier, per-space FPR/FNR). Pure: a trace in,
 * numbers out. Every windowed metric counts ticks with t >= onset.
 */
import type { TickRecord } from '../loop';

export type Metrics = {
  /** Mean |estimate - truth temp| over spaces and ticks >= onset (celsius). */
  estimationError: number;
  /**
   * Fraction of ticks >= onset where the brain reported confidence >= threshold AND its
   * burningSet differed from truth (sets compared as sorted id lists). The number a
   * Kalman baseline gets wrong: confidently naming the wrong fire.
   */
  falseCertainty: number;
  /**
   * Fraction of ticks >= onset where the true burning set is a subset of
   * (burningSet union every ambiguous group). High coverage with low false certainty is
   * the claim: when we are unsure, the truth is inside the set we report.
   */
  ambiguityCoverage: number;
  /**
   * Ticks from onset until the first tick where burningSet == truth for 5 consecutive
   * ticks (the first of those five, minus onset). null if that never happens.
   */
  timeToRecovery: number | null;
  /** Mean wall-clock ms per brain.step over the whole trace. */
  computeMsPerTick: number;
  /**
   * Fraction of ticks >= onset where burningSet contains a space that is NOT burning in
   * truth AND is not in any ambiguous group: a drone sent to the wrong floor with no
   * hedge. The operational cost of a wrong answer.
   */
  wrongDispatch: number;
  /**
   * Calibration: mean over spaces and ticks >= onset of (probability - truthBurning)^2,
   * truthBurning being 1 or 0. Lower is better. A brain that says 0.5 when it is right
   * half the time scores 0.25; one that says 0.97 and is wrong scores ~0.94 on that space.
   */
  brierScore: number;
  /** Fraction of (space, tick >= onset) pairs NOT burning in truth where probability >= 0.5. */
  falsePositiveRate: number;
  /** Fraction of (space, tick >= onset) pairs burning in truth where probability < 0.5. */
  falseNegativeRate: number;
  /**
   * False certainty defined on the PROBABILITY output rather than the scalar confidence:
   * for each threshold in P_THRESHOLDS, the fraction of ticks >= onset where some space that
   * is NOT burning in truth was given probability >= threshold. "Sure there is a fire here"
   * when there is not, at every level of sure. Keys are the thresholds as strings ('0.9').
   */
  falseCertaintyByP: Record<string, number>;
  /**
   * Fraction of ticks >= onset where belief.ambiguous is non-empty AND the tick's commands
   * target at least two different spaces inside one ambiguous group: the allocator hedged.
   * Zero on an open-loop trace (no commands recorded). (Additive, Dean, CP4 prompt 2.)
   */
  hedgeRate: number;
  /**
   * Spaces burning in truth at the last tick with the allocator minus the same with a null
   * allocator. Not computable from one trace: filled in by runContainment() in
   * src/eval/containment.ts, undefined otherwise. (Additive, Dean, CP4 prompt 2.)
   */
  containmentDelta?: number;
};

/** True when `commands` name two or more different spaces inside one of the ambiguous groups. */
export function isHedge(ambiguous: readonly (readonly string[])[], commands: readonly { goTo: string }[]): boolean {
  for (const group of ambiguous) {
    const inGroup = new Set(group);
    const targets = new Set(commands.filter((c) => inGroup.has(c.goTo)).map((c) => c.goTo));
    if (targets.size >= 2) return true;
  }
  return false;
}

/** Thresholds for falseCertaintyByP. */
export const P_THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95] as const;

export type MetricsOptions = {
  /** First tick of the evaluation window. Use the corruption onset; 0 for a clean run. */
  onset: number;
  /** Confidence at or above which a wrong burningSet counts as false certainty. Default 0.9. */
  confidenceThreshold?: number;
};

const PROB_DECISION = 0.5; // probability at or above this counts as "called burning"
const RECOVERY_TICKS = 5; // consecutive exact matches that count as recovered

/** Sets compared as sorted id lists, exactly as specified (a duplicate id is a difference). */
const sortedKey = (ids: readonly string[]): string => [...ids].sort().join(',');
const sameSet = (a: readonly string[], b: readonly string[]): boolean => sortedKey(a) === sortedKey(b);

export function computeMetrics(trace: TickRecord[], opts: MetricsOptions): Metrics {
  const onset = opts.onset;
  const threshold = opts.confidenceThreshold ?? 0.9;
  let errSum = 0;
  let errN = 0;
  let falseCertain = 0;
  let covered = 0;
  let wrong = 0;
  let windowN = 0;
  let brierSum = 0;
  let brierN = 0;
  let fp = 0;
  let negatives = 0;
  let fn = 0;
  let positives = 0;
  let msSum = 0;
  let hedged = 0;
  const fcByP = P_THRESHOLDS.map(() => 0);
  const exact: boolean[] = []; // per windowed tick, in order
  const windowTicks: number[] = [];
  for (const rec of trace) {
    msSum += rec.stepMs;
    if (rec.t < onset) continue;
    windowN += 1;
    windowTicks.push(rec.t);
    for (const s of rec.truth.spaces) {
      errSum += Math.abs((rec.belief.estimate[s.id] ?? 0) - s.temp);
      errN += 1;
    }
    const truthBurning = rec.truth.spaces.filter((s) => s.burning).map((s) => s.id);
    const truthSet = new Set(truthBurning);
    const isExact = sameSet(truthBurning, rec.belief.burningSet);
    exact.push(isExact);
    if (rec.belief.confidence >= threshold && !isExact) falseCertain += 1;
    const ambiguous = new Set(rec.belief.ambiguous.flat());
    const reported = new Set([...rec.belief.burningSet, ...ambiguous]);
    if (truthBurning.every((id) => reported.has(id))) covered += 1;
    if (rec.belief.burningSet.some((id) => !truthSet.has(id) && !ambiguous.has(id))) wrong += 1;
    if (rec.belief.ambiguous.length > 0 && isHedge(rec.belief.ambiguous, rec.commands)) hedged += 1;
    let maxWrongP = 0; // highest probability given to a space that is not burning
    for (const s of rec.truth.spaces) {
      // A brain that reports no probability is scored as if it said 0 everywhere.
      const p = rec.belief.probability?.[s.id] ?? 0;
      if (!s.burning && p > maxWrongP) maxWrongP = p;
      const y = s.burning ? 1 : 0;
      brierSum += (p - y) * (p - y);
      brierN += 1;
      if (s.burning) {
        positives += 1;
        if (p < PROB_DECISION) fn += 1;
      } else {
        negatives += 1;
        if (p >= PROB_DECISION) fp += 1;
      }
    }
    P_THRESHOLDS.forEach((th, i) => {
      if (maxWrongP >= th) fcByP[i] = (fcByP[i] ?? 0) + 1;
    });
  }
  let timeToRecovery: number | null = null;
  for (let i = 0; i + RECOVERY_TICKS <= exact.length; i++) {
    if (exact.slice(i, i + RECOVERY_TICKS).every(Boolean)) {
      timeToRecovery = windowTicks[i]! - onset;
      break;
    }
  }
  return {
    estimationError: errN ? errSum / errN : 0,
    falseCertainty: windowN ? falseCertain / windowN : 0,
    ambiguityCoverage: windowN ? covered / windowN : 0,
    timeToRecovery,
    computeMsPerTick: trace.length ? msSum / trace.length : 0,
    wrongDispatch: windowN ? wrong / windowN : 0,
    brierScore: brierN ? brierSum / brierN : 0,
    falsePositiveRate: negatives ? fp / negatives : 0,
    falseNegativeRate: positives ? fn / positives : 0,
    falseCertaintyByP: Object.fromEntries(P_THRESHOLDS.map((th, i) => [String(th), windowN ? fcByP[i]! / windowN : 0])),
    hedgeRate: windowN ? hedged / windowN : 0,
  };
}
