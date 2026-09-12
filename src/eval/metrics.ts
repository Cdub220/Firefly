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
};

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
  }
  return {
    estimationError: errN ? errSum / errN : 0,
    falseCertainty: windowN ? falseCertain / windowN : 0,
    ambiguityCoverage: windowN ? covered / windowN : 0,
    timeToRecovery: null,
    computeMsPerTick: null,
  };
}
