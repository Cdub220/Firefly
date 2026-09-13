/**
 * src/eval — owned by Dean.
 *
 * The four metrics the Defense brief names. v0 implements estimation error and a
 * placeholder false-certainty; time-to-recovery and compute cost are TODO(Dean).
 */
import type { TickRecord } from '../loop';

export type Metrics = {
  /** Mean absolute temp error over spaces and ticks (celsius). */
  estimationError: number;
  /**
   * Fraction of ticks AFTER corruption onset where the brain reported confidence >=
   * threshold AND its burningSet differed from truth. The number a Kalman baseline gets
   * wrong: confidently naming the wrong fire.
   */
  falseCertainty: number;
  /**
   * Fraction of ticks after onset where the true burning set is a subset of
   * (burningSet union every ambiguous group). High coverage with low false certainty is
   * the claim: when we are unsure, the truth is inside the set we report.
   */
  ambiguityCoverage: number;
  /** Ticks from first corruption onset to belief re-matching truth. TODO(Dean): CP3. */
  timeToRecovery: number | null;
  /** Wall-clock ms per brain.step, averaged. TODO(Dean): instrument in loop for CP3. */
  computeMsPerTick: number | null;
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
};

const PROB_DECISION = 0.5; // probability at or above this counts as "called burning"

export function computeMetrics(
  trace: TickRecord[],
  confidenceThreshold = 0.9,
  onset = 0,
): Metrics {
  let errSum = 0;
  let errN = 0;
  let falseCertain = 0;
  let covered = 0;
  let windowN = 0;
  let brierSum = 0;
  let brierN = 0;
  let fp = 0;
  let negatives = 0;
  let fn = 0;
  let positives = 0;
  for (const rec of trace) {
    for (const s of rec.truth.spaces) {
      errSum += Math.abs((rec.belief.estimate[s.id] ?? 0) - s.temp);
      errN += 1;
    }
    if (rec.t < onset) continue;
    windowN += 1;
    const truthBurning = rec.truth.spaces.filter((s) => s.burning).map((s) => s.id);
    const beliefSet = new Set(rec.belief.burningSet);
    const sameSet =
      truthBurning.length === beliefSet.size && truthBurning.every((id) => beliefSet.has(id));
    if (rec.belief.confidence >= confidenceThreshold && !sameSet) falseCertain += 1;
    const reported = new Set([...rec.belief.burningSet, ...rec.belief.ambiguous.flat()]);
    if (truthBurning.every((id) => reported.has(id))) covered += 1;
    for (const s of rec.truth.spaces) {
      // A brain that reports no probability is scored as if it said 0 everywhere.
      const p = rec.belief.probability?.[s.id] ?? 0;
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
  }
  return {
    estimationError: errN ? errSum / errN : 0,
    falseCertainty: windowN ? falseCertain / windowN : 0,
    ambiguityCoverage: windowN ? covered / windowN : 0,
    timeToRecovery: null,
    computeMsPerTick: null,
    brierScore: brierN ? brierSum / brierN : 0,
    falsePositiveRate: negatives ? fp / negatives : 0,
    falseNegativeRate: positives ? fn / positives : 0,
  };
}
