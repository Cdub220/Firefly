/**
 * src/eval — owned by Dean.
 *
 * `npm run brief:sweep`: the commander's brief on demo-6, vessel-3x8 and tower-5x4 for
 * freeze, blind and flashover, seeds 7, 8, 9 (CP4 prompt 3, task D), three brains each,
 * closed loop with the same allocator. Prints per-plan means of the side-by-side table and
 * the overall means, and writes results/brief-sweep.md and .json. No API call.
 *
 *   npm run brief:sweep
 *   npm run brief:sweep -- --plans demo-6 --modes freeze --seeds 7,8 --ticks 60
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlan } from '../shared/structures';
import type { CorruptionMode } from '../shared/types';
import { BRIEF_DEFAULTS, BRIEF_MODES, cell, runBriefs, TABLE_COLUMNS, type BriefOptions, type TableColumn } from './brief-cli';

export type BriefSweepOptions = { plans: string[]; modes: CorruptionMode[]; seeds: number[]; ticks: number; brains: string[] };
export const BRIEF_SWEEP_DEFAULTS: BriefSweepOptions = { plans: ['demo-6', 'vessel-3x8', 'tower-5x4'], modes: ['freeze', 'blind', 'flashover'], seeds: [7, 8, 9], ticks: 120, brains: [...BRIEF_DEFAULTS.brains] };

export type BriefSweepRow = { plan: string; mode: CorruptionMode; seed: number; brain: string } & Record<TableColumn, number | null>;

export function runBriefSweep(o: BriefSweepOptions, onRun?: (done: number, total: number) => void): BriefSweepRow[] {
  const rows: BriefSweepRow[] = [];
  const total = o.plans.length * o.modes.length * o.seeds.length;
  let done = 0;
  for (const plan of o.plans) {
    for (const mode of o.modes) {
      for (const seed of o.seeds) {
        const opts: BriefOptions = { ...BRIEF_DEFAULTS, plan, mode, seed, ticks: o.ticks, brains: o.brains };
        const { runs } = runBriefs(opts);
        for (const r of runs) rows.push({ plan, mode, seed, brain: r.name, ...(Object.fromEntries(TABLE_COLUMNS.map((c) => [c, cell(r.outcome, c)])) as Record<TableColumn, number | null>) });
        done += 1;
        onRun?.(done, total);
      }
    }
  }
  return rows;
}

/** Mean per column over rows; null cells ("never") are excluded and their count reported. */
export type MeanRow = { group: string; brain: string; n: number } & Record<TableColumn, { mean: number | null; never: number }>;

export function meansBy(rows: BriefSweepRow[], groupOf: (r: BriefSweepRow) => string, brains: string[]): MeanRow[] {
  const out: MeanRow[] = [];
  const groups = [...new Set(rows.map(groupOf))];
  for (const group of groups) {
    for (const brain of brains) {
      const rs = rows.filter((r) => groupOf(r) === group && r.brain === brain);
      if (rs.length === 0) continue;
      const cols = Object.fromEntries(
        TABLE_COLUMNS.map((c) => {
          const vals = rs.map((r) => r[c]).filter((v): v is number => v !== null);
          return [c, { mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, never: rs.length - vals.length }];
        }),
      ) as Record<TableColumn, { mean: number | null; never: number }>;
      out.push({ group, brain, n: rs.length, ...cols });
    }
  }
  return out;
}

const fmtMean = (m: { mean: number | null; never: number }): string => {
  if (m.mean === null) return 'never';
  const s = Number.isInteger(m.mean) ? String(m.mean) : m.mean.toFixed(1);
  return m.never ? `${s}*` : s;
};

export function formatMeans(means: MeanRow[]): string {
  const w = 16;
  const head = ['group'.padEnd(12), 'brain'.padEnd(15), 'n'.padStart(3), ...TABLE_COLUMNS.map((c) => c.padStart(w))].join('');
  const lines = [head];
  let last = '';
  for (const m of means) {
    if (last && m.group !== last) lines.push('');
    last = m.group;
    lines.push([m.group.padEnd(12), m.brain.padEnd(15), String(m.n).padStart(3), ...TABLE_COLUMNS.map((c) => fmtMean(m[c]).padStart(w))].join(''));
  }
  lines.push('');
  lines.push('* = mean over the runs where it happened; the rest never did (containedAt / extinguishedAt).');
  return lines.join('\n');
}

export function parseBriefSweepArgs(argv: string[]): BriefSweepOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (v: string | undefined): string[] | undefined => (v === undefined ? undefined : v.split(',').map((s) => s.trim()).filter(Boolean));
  const o: BriefSweepOptions = { ...BRIEF_SWEEP_DEFAULTS, plans: [...BRIEF_SWEEP_DEFAULTS.plans], modes: [...BRIEF_SWEEP_DEFAULTS.modes], seeds: [...BRIEF_SWEEP_DEFAULTS.seeds], brains: [...BRIEF_SWEEP_DEFAULTS.brains] };
  const plans = list(get('--plans'));
  if (plans) {
    for (const p of plans) loadPlan(p);
    o.plans = plans;
  }
  const modes = list(get('--modes'));
  if (modes) {
    for (const m of modes) if (!(BRIEF_MODES as string[]).includes(m)) throw new Error(`--modes ${m}: expected one of ${BRIEF_MODES.join(', ')}`);
    o.modes = modes as CorruptionMode[];
  }
  const seeds = list(get('--seeds'));
  if (seeds) {
    o.seeds = seeds.map(Number);
    if (o.seeds.some((s) => !Number.isInteger(s))) throw new Error('--seeds: expected integers');
  }
  const ticks = get('--ticks');
  if (ticks !== undefined) {
    o.ticks = Number(ticks);
    if (!Number.isInteger(o.ticks) || o.ticks < 1) throw new Error('--ticks: expected a positive integer');
  }
  const brains = list(get('--brains'));
  if (brains) o.brains = brains;
  for (const [name, v] of [['plans', o.plans], ['modes', o.modes], ['seeds', o.seeds], ['brains', o.brains]] as const) {
    if (v.length === 0) throw new Error(`--${name}: expected at least one value`);
  }
  return o;
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const o = parseBriefSweepArgs(process.argv.slice(2));
  console.log(`brief:sweep  plans=${o.plans.join(',')}  modes=${o.modes.join(',')}  seeds=${o.seeds.join(',')}  ticks=${o.ticks}  brains=${o.brains.join(',')}  (closed loop, same allocator; corruption onset 5, k 1, target = ignition)`);
  const rows = runBriefSweep(o, (done, total) => process.stdout.write(`  ${done}/${total} configurations\n`));
  const byPlan = meansBy(rows, (r) => r.plan, o.brains);
  const byMode = meansBy(rows, (r) => r.mode, o.brains);
  const overall = meansBy(rows, () => 'all', o.brains);
  const text = ['BY PLAN', formatMeans(byPlan), '', 'BY MODE', formatMeans(byMode), '', 'OVERALL', formatMeans(overall)].join('\n');
  console.log('');
  console.log(text);
  mkdirSync('results', { recursive: true });
  writeFileSync('results/brief-sweep.md', `# Commander's brief sweep\n\n\`${process.argv.slice(2).join(' ') || 'defaults'}\`: plans ${o.plans.join(', ')}; modes ${o.modes.join(', ')}; seeds ${o.seeds.join(', ')}; ${o.ticks} ticks; closed loop, same allocator.\n\n\`\`\`\n${text}\n\`\`\`\n`);
  writeFileSync('results/brief-sweep.json', JSON.stringify({ options: o, rows, byPlan, byMode, overall }, null, 1));
  console.log('\nwrote results/brief-sweep.md and results/brief-sweep.json');
}
