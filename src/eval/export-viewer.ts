/**
 * Export a self-contained HTML split view (truth | ours | kalman) for one run.
 *
 *   npm run viewer -- --plan vessel-3x8 --mode flashover --k 1 --onset 5 --target L1-B3 --ticks 60 --seed 42
 *
 * Writes results/viewer-<mode>.html (results/viewer-<plan>-<mode>.html for plans other
 * than the default). Open it in a browser; no server needed. The same view runs live at
 * `npm run dev` (src/ui/split); this is the filming backup. Geometry comes from
 * buildViewerData (src/eval/layout.ts), so both render from the same positions.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLoopMulti } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import { buildViewerData } from './viewerData';
import type { CorruptionConfig, CorruptionMode } from '../shared/types';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const str = (flag: string, d: string): string => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] !== undefined ? String(argv[i + 1]) : d; };
const num = (flag: string, d: number): number => { const v = Number(str(flag, String(d))); return Number.isFinite(v) ? v : d; };

const planName = str('--plan', PLAN_NAMES[0] ?? 'demo-6');
const plan = loadPlan(planName); // throws with the list of names on a typo
const mode = str('--mode', 'freeze') as CorruptionMode;
const seed = num('--seed', 42);
const ticks = num('--ticks', 60);
const onset = num('--onset', 5);
const k = num('--k', 1);
const targetArg = str('--target', plan.ignition[0] ?? '');
const target = targetArg ? targetArg.split(',') : undefined;
const defaultOut = planName === PLAN_NAMES[0] ? `viewer-${mode}.html` : `viewer-${planName}-${mode}.html`;
const out = str('--out', join(here, '..', '..', 'results', defaultOut));

const corruption: Omit<CorruptionConfig, 'seed'> = mode === 'none' ? { mode } : { mode, k, onset, ...(target ? { target } : {}) };
const traces = runLoopMulti({ plan, seed, ticks, corruption, brains: { ours: createBrain, kalman: createKalmanBrain }, primary: 'ours' });
const data = buildViewerData(plan, traces, { seed, corruption });

const template = readFileSync(join(here, 'viewer.template.html'), 'utf8');
const body = template.replace('__DATA__', JSON.stringify(data));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n${body}\n</head></html>\n`);
console.log(`wrote ${out}  (plan=${planName}, ${ticks} ticks, mode=${mode})`);
