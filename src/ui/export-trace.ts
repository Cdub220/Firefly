/**
 * `npm run export:trace` — write results/demo-trace.json: the five script beats (plus
 * blind), recorded, so the stage demo can replay them if the live sim ever breaks.
 *
 *   npm run export:trace                      # seed 42, 60 ticks, from the first plan
 *   npm run export:trace -- --seed 7 --ticks 80 --out results/demo-trace-7.json
 *   npm run export:trace -- --stamp           # also record the export time (the file then differs run to run)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildDemoTrace, BUILD_DEFAULTS } from './demoTraceBuild';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
}

const seed = Number(arg('seed', String(BUILD_DEFAULTS.seed)));
const ticks = Number(arg('ticks', String(BUILD_DEFAULTS.ticks)));
const out = arg('out', 'results/demo-trace.json');
const t0 = performance.now();
const stamp = process.argv.includes('--stamp');
const trace = buildDemoTrace({ seed, ticks, ...(stamp ? { now: () => new Date().toISOString() } : {}) });
mkdirSync(dirname(out), { recursive: true });
// stepMs is wall-clock noise; zero it so the file is byte-identical across runs (without --stamp).
for (const b of trace.beats) for (const t of Object.values(b.traces).concat(Object.values(b.compare ?? {}))) for (const r of t) r.stepMs = 0;
// Three decimals is well under anything the views show (they round to 0-2) and halves the file.
const json = JSON.stringify(trace, (_k, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v));
writeFileSync(out, json);
const ms = Math.round(performance.now() - t0);
console.log(`wrote ${out}: ${trace.beats.length} beats (${trace.beats.map((b) => `${b.beat}@${b.planName}`).join(', ')}), ${(json.length / 1024).toFixed(0)} KB, ${ms} ms`);
