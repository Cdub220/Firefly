/**
 * src/eval — owned by Dean.
 *
 * `npm run brief -- --plan vessel-3x8 --mode flashover --seed 7 --ticks 120 [--brains ours,kalman-source]`
 * Runs each named brain CLOSED-LOOP on the same seed (same world, same corruption, its own
 * commands applied), prints each commander's brief, then a side-by-side table, and writes
 * results/brief-<plan>-<mode>-<seed>.md and .json. Same corruption defaults as the sweep:
 * onset 5, k 1, target = the ignition space. No API call anywhere.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createBrain } from '../brain';
import { createKalmanBrain, createKalmanDispatching, createSourceKalmanBrain, createSourceKalmanDispatching } from '../brain/kalman';
import { runLoop, type BrainFactory, type TickRecord } from '../loop';
import { loadPlan } from '../shared/structures';
import type { CorruptionConfig, CorruptionMode, StructurePlan } from '../shared/types';
import { renderBrief } from './brief';
import { computeOutcome, type BriefFile, type Outcome } from './outcome';

/** Brains the CLI knows. The Kalman entries dispatch through the same allocator as ours. */
export const BRIEF_BRAINS: Record<string, BrainFactory> = {
  ours: createBrain,
  kalman: createKalmanDispatching,
  'kalman-source': createSourceKalmanDispatching,
  'kalman-idle': createKalmanBrain,
  'kalman-source-idle': createSourceKalmanBrain,
};
export const DEFAULT_BRIEF_BRAINS = ['ours', 'kalman', 'kalman-source'];
export const BRIEF_MODES: readonly CorruptionMode[] = ['none', 'freeze', 'blind', 'saturate', 'flashover', 'mixed'];

export type BriefOptions = { plan: string; mode: CorruptionMode; seed: number; ticks: number; brains: string[]; onset: number; k: number; outDir: string };
export const BRIEF_DEFAULTS: BriefOptions = { plan: 'vessel-3x8', mode: 'flashover', seed: 7, ticks: 120, brains: [...DEFAULT_BRIEF_BRAINS], onset: 5, k: 1, outDir: 'results' };

export const TABLE_COLUMNS = ['fireVolume', 'peakBurning', 'containedAt', 'extinguishedAt', 'spacesBurnedOut', 'tetherTicks', 'retardantSpent', 'droneDeaths', 'wrongFloor', 'hedges'] as const;
export type TableColumn = (typeof TABLE_COLUMNS)[number];

/** The table cell for a column, as a number (null = never / none). */
export function cell(o: Outcome, col: TableColumn): number | null {
  switch (col) {
    case 'fireVolume': return o.fireVolume;
    case 'peakBurning': return o.peakBurning;
    case 'containedAt': return o.containedAt;
    case 'extinguishedAt': return o.extinguishedAt;
    case 'spacesBurnedOut': return o.spacesBurnedOut.length;
    case 'tetherTicks': return o.tetherTicks;
    case 'retardantSpent': return o.retardantSpent;
    case 'droneDeaths': return Object.values(o.droneDeaths).reduce((a, v) => a + (v?.length ?? 0), 0);
    case 'wrongFloor': return o.wrongFloor;
    case 'hedges': return o.hedges;
  }
}

export function corruptionFor(plan: StructurePlan, o: Pick<BriefOptions, 'mode' | 'onset' | 'k'>): Omit<CorruptionConfig, 'seed'> {
  return o.mode === 'none' ? { mode: 'none' } : { mode: o.mode, k: o.k, onset: o.onset, target: [plan.ignition[0] ?? plan.spaces[0]!.id], ambient: plan.ambient };
}

export type BriefRun = { name: string; trace: TickRecord[]; outcome: Outcome; brief: string };

export function runBriefs(o: BriefOptions): { runs: BriefRun[]; file: BriefFile } {
  const plan = loadPlan(o.plan);
  const corruption = corruptionFor(plan, o);
  const runs: BriefRun[] = o.brains.map((name) => {
    const factory = BRIEF_BRAINS[name];
    if (!factory) throw new Error(`unknown brain "${name}"; expected one of ${Object.keys(BRIEF_BRAINS).join(', ')}`);
    const trace = runLoop({ plan, seed: o.seed, ticks: o.ticks, corruption, brain: factory, dispatch: true });
    const outcome = computeOutcome(trace, plan);
    const brief = renderBrief(name, trace, plan, outcome, { mode: o.mode, seed: o.seed, ...(o.mode === 'none' ? {} : { onset: o.onset, k: o.k }) });
    return { name, trace, outcome, brief };
  });
  const file: BriefFile = {
    plan: o.plan, mode: o.mode, seed: o.seed, ticks: o.ticks, onset: o.onset, k: o.k,
    target: 'target' in corruption && corruption.target ? corruption.target : [],
    brains: runs.map((r) => ({ name: r.name, outcome: r.outcome, brief: r.brief })),
  };
  return { runs, file };
}

const fmt = (v: number | null): string => (v === null ? 'never' : Number.isInteger(v) ? String(v) : v.toFixed(2));

/** Fixed-width side-by-side table: one row per brain. */
export function formatTable(runs: BriefRun[]): string {
  const w = 16;
  const head = ['brain'.padEnd(16), ...TABLE_COLUMNS.map((c) => c.padStart(w))].join('');
  const rows = runs.map((r) => [r.name.padEnd(16), ...TABLE_COLUMNS.map((c) => fmt(cell(r.outcome, c)).padStart(w))].join(''));
  return [head, ...rows].join('\n');
}

export function parseBriefArgs(argv: string[]): BriefOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const o: BriefOptions = { ...BRIEF_DEFAULTS, brains: [...BRIEF_DEFAULTS.brains] };
  const plan = get('--plan');
  if (plan !== undefined) {
    loadPlan(plan);
    o.plan = plan;
  }
  const mode = get('--mode');
  if (mode !== undefined) {
    if (!(BRIEF_MODES as string[]).includes(mode)) throw new Error(`--mode ${mode}: expected one of ${BRIEF_MODES.join(', ')}`);
    o.mode = mode as CorruptionMode;
  }
  for (const [flag, key] of [['--seed', 'seed'], ['--ticks', 'ticks'], ['--onset', 'onset'], ['--k', 'k']] as const) {
    const v = get(flag);
    if (v !== undefined) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || (key === 'ticks' && n < 1) || (key === 'k' && n < 1)) throw new Error(`${flag}: expected a positive integer`);
      o[key] = n;
    }
  }
  const brains = get('--brains');
  if (brains !== undefined) {
    o.brains = brains.split(',').map((s) => s.trim()).filter(Boolean);
    if (o.brains.length === 0) throw new Error('--brains: expected at least one name');
    for (const b of o.brains) if (!BRIEF_BRAINS[b]) throw new Error(`--brains ${b}: expected one of ${Object.keys(BRIEF_BRAINS).join(', ')}`);
  }
  const out = get('--out');
  if (out !== undefined) o.outDir = out;
  return o;
}

export function writeBrief(o: BriefOptions, runs: BriefRun[], file: BriefFile): { md: string; json: string } {
  mkdirSync(o.outDir, { recursive: true });
  const base = `${o.outDir}/brief-${o.plan}-${o.mode}-${o.seed}`;
  const md = [
    `# Commander's brief: ${o.plan}, ${o.mode}, seed ${o.seed}, ${o.ticks} ticks`,
    '',
    'Same allocator, one belief per brain, one world each (closed loop).',
    '',
    '```',
    formatTable(runs),
    '```',
    '',
    ...runs.flatMap((r) => ['```', r.brief, '```', '']),
  ].join('\n');
  writeFileSync(`${base}.md`, md);
  writeFileSync(`${base}.json`, JSON.stringify(file, null, 1));
  return { md: `${base}.md`, json: `${base}.json` };
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const o = parseBriefArgs(process.argv.slice(2));
  const { runs, file } = runBriefs(o);
  for (const r of runs) {
    console.log(r.brief);
    console.log('');
  }
  console.log(formatTable(runs));
  const paths = writeBrief(o, runs, file);
  console.log(`\nwrote ${paths.md} and ${paths.json}`);
}
