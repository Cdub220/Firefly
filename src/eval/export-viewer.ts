/**
 * Export a self-contained HTML split view (truth | ours | kalman) for one run.
 *
 *   npm run viewer -- --mode freeze --k 1 --onset 5 --target S3 --ticks 60 --seed 42
 *
 * Writes results/viewer-<mode>.html. Open it in a browser; no server needed.
 * Both brains see the identical corrupted observation stream (runLoopMulti).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_PLAN, runLoopMulti } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import type { CorruptionConfig, CorruptionMode } from '../shared/types';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const str = (flag: string, d: string): string => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] !== undefined ? String(argv[i + 1]) : d; };
const num = (flag: string, d: number): number => { const v = Number(str(flag, String(d))); return Number.isFinite(v) ? v : d; };

const mode = str('--mode', 'freeze') as CorruptionMode;
const seed = num('--seed', 42);
const ticks = num('--ticks', 60);
const onset = num('--onset', 5);
const k = num('--k', 1);
const targetArg = str('--target', DEMO_PLAN.ignition[0] ?? '');
const target = targetArg ? targetArg.split(',') : undefined;
const out = str('--out', join(here, '..', '..', 'results', `viewer-${mode}.html`));

const corruption: Omit<CorruptionConfig, 'seed'> = mode === 'none' ? { mode } : { mode, k, onset, ...(target ? { target } : {}) };
const traces = runLoopMulti({ plan: DEMO_PLAN, seed, ticks, corruption, brains: { ours: createBrain, kalman: createKalmanBrain }, primary: 'ours' });
const ours = traces.ours!, kalman = traces.kalman!;

const pick = (b: (typeof ours)[number]['belief']) => ({
  estimate: Object.fromEntries(Object.entries(b.estimate).map(([id, v]) => [id, Math.round(v * 10) / 10])),
  burningSet: b.burningSet, ambiguous: b.ambiguous, suspectSensors: b.suspectSensors, confidence: Math.round(b.confidence * 100) / 100,
});
const data = {
  plan: { name: DEMO_PLAN.name, spaces: DEMO_PLAN.spaces.map((s) => ({ id: s.id })), edges: DEMO_PLAN.edges, sensors: DEMO_PLAN.sensors },
  ambient: DEMO_PLAN.ambient, seed, corruption, onset: mode === 'none' ? null : onset, startAt: Math.max(0, onset - 2),
  note: 'Six spaces in a ring, one fixed sensor each. Left is the world as it is. Middle and right are two estimators reading the same damaged sensor feed. Solid red border: believed burning. Dashed amber: the brain cannot rule it out. Red tag: wrong. Struck-through chip: the brain has stopped trusting that sensor.',
  ticks: ours.map((r, i) => ({
    t: r.t,
    truth: Object.fromEntries(r.truth.spaces.map((s) => [s.id, { temp: Math.round(s.temp * 10) / 10, burning: s.burning }])),
    readings: r.obs.readings.map((x) => ({ sensorId: x.sensorId, source: x.source, spaceId: x.spaceId, temp: Math.round(x.temp * 10) / 10, t: x.t })),
    brains: { ours: pick(r.belief), kalman: pick(kalman[i]!.belief) },
  })),
};

const template = readFileSync(join(here, 'viewer.template.html'), 'utf8');
const body = template.replace('__DATA__', JSON.stringify(data));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n${body}\n</head></html>\n`);
console.log(`wrote ${out}  (${ticks} ticks, mode=${mode})`);
