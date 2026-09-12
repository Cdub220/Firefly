/**
 * The checkpoint-2 number: both brains on identical corrupted observations across the
 * three headline corruption modes, five seeds each. `npm run evidence [--verbose]`.
 *
 * Prints mode | brain | falseCertainty | ambiguityCoverage | meanAbsErr, writes
 * results/evidence-cp2.json, and ends with the one sentence for the video.
 * --verbose additionally prints, per tick of the first seed of each mode, our brain's
 * suspect sensors and both burning sets against truth — the diagnosis view.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { DEMO_PLAN, runLoopMulti, type TickRecord } from '../loop';
import { computeMetrics } from './metrics';
import type { CorruptionConfig, CorruptionMode, SpaceId } from '../shared/types';

const TICKS = 60;
const ONSET = 5;
const SEEDS = [1, 2, 3, 4, 5];
const MODES: CorruptionMode[] = ['freeze', 'blind', 'flashover'];
const VERBOSE = process.argv.includes('--verbose');

// Target: the ignition space and its hottest neighbor (highest-rate edge).
const ignition = DEMO_PLAN.ignition[0]!;
const hottestNeighbor = DEMO_PLAN.edges
  .filter((e) => e.a === ignition || e.b === ignition)
  .sort((a, b) => b.rate - a.rate)
  .map((e) => (e.a === ignition ? e.b : e.a))[0]!;
const TARGET: SpaceId[] = [ignition, hottestNeighbor];

type Row = {
  mode: CorruptionMode;
  brain: string;
  falseCertainty: number;
  ambiguityCoverage: number;
  meanAbsErr: number;
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function runMode(mode: CorruptionMode): Row[] {
  const corruption: Omit<CorruptionConfig, 'seed'> = {
    mode,
    k: 1,
    target: TARGET,
    onset: ONSET,
    ambient: DEMO_PLAN.ambient,
  };
  const perBrain = new Map<string, { fc: number[]; cov: number[]; err: number[] }>();
  for (const seed of SEEDS) {
    const traces = runLoopMulti({
      plan: DEMO_PLAN,
      seed,
      ticks: TICKS,
      corruption,
      brains: { ours: createBrain, kalman: createKalmanBrain },
      primary: 'ours',
    });
    for (const [name, trace] of Object.entries(traces)) {
      const m = computeMetrics(trace, 0.9, ONSET);
      const acc = perBrain.get(name) ?? { fc: [], cov: [], err: [] };
      acc.fc.push(m.falseCertainty);
      acc.cov.push(m.ambiguityCoverage);
      acc.err.push(m.estimationError);
      perBrain.set(name, acc);
    }
    if (VERBOSE && seed === SEEDS[0]) printVerbose(mode, traces);
  }
  return [...perBrain.entries()].map(([brain, a]) => ({
    mode,
    brain,
    falseCertainty: mean(a.fc),
    ambiguityCoverage: mean(a.cov),
    meanAbsErr: mean(a.err),
  }));
}

function printVerbose(mode: CorruptionMode, traces: Record<string, TickRecord[]>): void {
  console.log(`\n--- verbose: ${mode}, seed ${SEEDS[0]} ---`);
  const ours = traces['ours']!;
  const kalman = traces['kalman']!;
  for (let i = 0; i < ours.length; i++) {
    const o = ours[i]!;
    const truth = o.truth.spaces.filter((s) => s.burning).map((s) => s.id).join(',') || '-';
    const susp = o.belief.suspectSensors.join(',') || '-';
    const amb = o.belief.ambiguous.map((g) => g.join('|')).join(';') || '-';
    console.log(
      `t=${String(o.t).padStart(3)} truth=[${truth}] ours=[${o.belief.burningSet.join(',') || '-'}]` +
        ` c=${o.belief.confidence.toFixed(2)} susp=${susp} amb=${amb}` +
        ` kalman=[${kalman[i]!.belief.burningSet.join(',') || '-'}] c=${kalman[i]!.belief.confidence.toFixed(2)}`,
    );
  }
}

const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;

console.log(
  `evidence-cp2  plan=${DEMO_PLAN.name}  ticks=${TICKS}  onset=${ONSET}  k=1  target=${TARGET.join(',')}  seeds=${SEEDS.join(',')}`,
);
const rows = MODES.flatMap(runMode);

console.log(`\n  ${'mode'.padEnd(11)}${'brain'.padEnd(9)}${'falseCert'.padStart(10)}${'coverage'.padStart(10)}${'meanErr C'.padStart(11)}`);
for (const r of rows) {
  console.log(
    `  ${r.mode.padEnd(11)}${r.brain.padEnd(9)}${pct(r.falseCertainty).padStart(10)}${pct(r.ambiguityCoverage).padStart(10)}${r.meanAbsErr.toFixed(1).padStart(11)}`,
  );
}

mkdirSync('results', { recursive: true });
writeFileSync(
  'results/evidence-cp2.json',
  JSON.stringify({ plan: DEMO_PLAN.name, ticks: TICKS, onset: ONSET, k: 1, target: TARGET, seeds: SEEDS, rows }, null, 2),
);
console.log('\nwrote results/evidence-cp2.json');

for (const mode of MODES) {
  const ours = rows.find((r) => r.mode === mode && r.brain === 'ours')!;
  const kal = rows.find((r) => r.mode === mode && r.brain === 'kalman')!;
  console.log(
    `${mode}: kalman false-certain ${pct(kal.falseCertainty)} of ticks, ours ${pct(ours.falseCertainty)}, coverage ${pct(ours.ambiguityCoverage)}.`,
  );
}
