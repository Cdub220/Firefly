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
   * Fraction of ticks where the brain reported confidence >= threshold AND its burningSet
   * differed from truth. The number a Kalman baseline gets wrong.
   */
  falseCertainty: number;
  /** Ticks from first corruption onset to belief re-matching truth. TODO(Dean). */
  timeToRecovery: number | null;
  /** Wall-clock ms per brain.step, averaged. TODO(Dean): instrument in loop. */
  computeMsPerTick: number | null;
};

export function computeMetrics(trace: TickRecord[], confidenceThreshold = 0.9): Metrics {
  let errSum = 0;
  let errN = 0;
  let falseCertain = 0;
  for (const rec of trace) {
    for (const s of rec.truth.spaces) {
      errSum += Math.abs((rec.belief.estimate[s.id] ?? 0) - s.temp);
      errN += 1;
    }
    const truthSet = rec.truth.spaces.filter((s) => s.burning).map((s) => s.id).sort().join(',');
    const beliefSet = [...rec.belief.burningSet].sort().join(',');
    if (rec.belief.confidence >= confidenceThreshold && truthSet !== beliefSet) falseCertain += 1;
  }
  return {
    estimationError: errN ? errSum / errN : 0,
    falseCertainty: trace.length ? falseCertain / trace.length : 0,
    timeToRecovery: null,
    computeMsPerTick: null,
  };
}
