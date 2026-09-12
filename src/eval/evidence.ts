/**
 * The checkpoint-1 evidence run: both brains on identical corrupted observations, and the
 * count of ticks where the baseline is confidently wrong. `npm run evidence`.
 *
 * Runs the sim:freeze configuration (freeze the ignition space's sensor at onset 5). If
 * that produces no confidently-wrong Kalman ticks — which happens while the world's
 * physics is still the constant-temp stub, because a frozen reading of an unchanging
 * truth is indistinguishable from an honest one — it says so plainly and falls back to
 * the blind configuration, which diverges even with constant truth (the blinded sensor
 * says ambient while the space burns at 450).
 */
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { DEMO_PLAN, runLoopMulti, type TickRecord } from '../loop';
import type { CorruptionConfig } from '../shared/types';

const SEED = 42;
const TICKS = 60;
const CONFIDENT = 0.9;

type BrainStats = {
  confidentlyWrongTicks: number;
  firstConfidentlyWrongTick: number | null;
  meanAbsErrC: number;
};

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

function stats(trace: TickRecord[]): BrainStats {
  let wrong = 0;
  let first: number | null = null;
  let errSum = 0;
  let errN = 0;
  for (const rec of trace) {
    const truthBurning = rec.truth.spaces.filter((s) => s.burning).map((s) => s.id);
    if (!sameSet(rec.belief.burningSet, truthBurning) && rec.belief.confidence > CONFIDENT) {
      wrong++;
      first ??= rec.t;
    }
    for (const s of rec.truth.spaces) {
      errSum += Math.abs((rec.belief.estimate[s.id] ?? 0) - s.temp);
      errN++;
    }
  }
  return { confidentlyWrongTicks: wrong, firstConfidentlyWrongTick: first, meanAbsErrC: errSum / errN };
}

function run(corruption: Omit<CorruptionConfig, 'seed'>): Record<string, BrainStats> {
  const traces = runLoopMulti({
    plan: DEMO_PLAN,
    seed: SEED,
    ticks: TICKS,
    corruption: { ...corruption, ambient: DEMO_PLAN.ambient },
    brains: { ours: createBrain, kalman: createKalmanBrain },
    primary: 'ours',
  });
  return Object.fromEntries(Object.entries(traces).map(([name, trace]) => [name, stats(trace)]));
}

function printTable(label: string, results: Record<string, BrainStats>): void {
  const names = Object.keys(results);
  const row = (metric: string, get: (s: BrainStats) => string): string =>
    `  ${metric.padEnd(42)}${names.map((n) => get(results[n]!).padStart(10)).join('')}`;
  console.log(`\n${label}`);
  console.log(`  ${''.padEnd(42)}${names.map((n) => n.padStart(10)).join('')}`);
  console.log(row(`confidently wrong ticks (conf > ${CONFIDENT})`, (s) => String(s.confidentlyWrongTicks)));
  console.log(row('first confidently wrong tick', (s) => (s.firstConfidentlyWrongTick === null ? '-' : String(s.firstConfidentlyWrongTick))));
  console.log(row('mean abs temp error (C)', (s) => s.meanAbsErrC.toFixed(1)));
}

const ignition = DEMO_PLAN.ignition;
const freezeCfg: Omit<CorruptionConfig, 'seed'> = { mode: 'freeze', k: 1, target: ignition, onset: 5 };
const blindCfg: Omit<CorruptionConfig, 'seed'> = { mode: 'blind', k: 1, target: ignition, onset: 5 };

console.log(`evidence  plan=${DEMO_PLAN.name}  seed=${SEED}  ticks=${TICKS}  target=${ignition.join(',')}`);

const freeze = run(freezeCfg);
printTable(`freeze k=1 onset=5 (sim:freeze)`, freeze);

if (freeze['kalman']!.confidentlyWrongTicks === 0) {
  console.log(
    '\n  NOTE: freeze produced no confidently-wrong Kalman ticks. The world physics is\n' +
      '  still the constant-temp stub, so a frozen reading equals the unchanging truth.\n' +
      '  Falling back to blind corruption, which diverges even with constant truth:',
  );
  printTable(`blind k=1 onset=5 (sim:blind fallback)`, run(blindCfg));
}
