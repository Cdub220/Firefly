/**
 * Single-run metrics CLI: `npx tsx src/eval/index.ts --seed 42 --ticks 200` prints one run's
 * metrics as JSON. The multi-run harnesses live beside it: sweep.ts (`npm run sweep`),
 * evidence.ts (`npm run evidence`), mismatch.ts, hedge.ts, brief-cli.ts, identifiability.ts.
 */
import { DEMO_PLAN, runLoop, onsetOf } from '../loop';
import { computeMetrics } from './metrics';

export { computeMetrics } from './metrics';
export type { Metrics } from './metrics';

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const num = (flag: string, d: number): number => {
    const i = argv.indexOf(flag);
    const v = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isFinite(v) ? v : d;
  };
  const seed = num('--seed', 42);
  const ticks = num('--ticks', 200);
  const trace = runLoop({ plan: DEMO_PLAN, seed, ticks });
  // A clean run has no onset; the window is the whole trace, which starts at tick 1.
  const onset = onsetOf(undefined) ?? trace[0]?.t ?? 1;
  console.log(JSON.stringify({ plan: DEMO_PLAN.name, seed, ticks, onset, ...computeMetrics(trace, { onset }) }, null, 2));
}
