/**
 * The head-to-head sweep: both brains on identical observation streams over every plan,
 * failure mode, corruption budget k, sensor location and seed, scored on the six metrics.
 *
 *   npm run sweep                      full grid (see DEFAULTS)
 *   npm run sweep -- --quick           2 seeds, 60 ticks, for iteration
 *   npm run sweep -- --plans demo-6 --modes freeze,blind --k 1,2 --targets ignition,far --seeds 1..3 --ticks 80
 *
 * Writes results/sweep-<timestamp>.json and results/sweep-latest.json (one row per cell
 * per brain), prints a fixed-width summary aggregated over seeds with ours and kalman on
 * adjacent rows, and ends with WHERE OURS LOSES: every aggregated cell where ours has a
 * higher false certainty or wrong dispatch than the baseline. Those rows are the point of
 * the checkpoint-3 video, so they are never hidden.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBrain } from '../brain';
import { createGatedKalmanBrain, createKalmanBrain, createSourceKalmanBrain } from '../brain/kalman';
import { runLoop, runLoopMulti } from '../loop';
import { edgeMap } from '../shared/plan';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import type { CorruptionConfig, CorruptionMode, SpaceId, StructurePlan } from '../shared/types';
import { computeMetrics, type Metrics } from './metrics';

export type TargetKind = 'ignition' | 'neighbor' | 'far' | 'random';
export const TARGET_KINDS: readonly TargetKind[] = ['ignition', 'neighbor', 'far', 'random'];
export const SWEEP_MODES: readonly CorruptionMode[] = ['freeze', 'blind', 'saturate', 'flashover', 'mixed'];
const BRAINS = { ours: createBrain, kalman: createKalmanBrain, 'kalman-gated': createGatedKalmanBrain, 'kalman-source': createSourceKalmanBrain } as const;
const BRAIN_ORDER: readonly string[] = ['ours', 'kalman', 'kalman-gated', 'kalman-source'];
/** WHERE OURS LOSES compares against the best of every baseline: naive, gated, and source-estimating. */
const BASELINES: readonly BrainName[] = ['kalman', 'kalman-gated', 'kalman-source'];
export type BrainName = keyof typeof BRAINS;

export type SweepOptions = {
  plans: string[];
  modes: CorruptionMode[];
  ks: number[];
  targets: TargetKind[];
  onset: number;
  seeds: number[];
  ticks: number;
  /** Directory for the JSON outputs. Default results/. */
  outDir?: string;
  /** Called after each cell (both brains); for progress printing. */
  onCell?: (done: number, total: number) => void;
};

export const DEFAULTS: SweepOptions = {
  plans: [...PLAN_NAMES],
  modes: [...SWEEP_MODES],
  ks: [1, 2, 3],
  targets: [...TARGET_KINDS],
  onset: 5,
  seeds: Array.from({ length: 10 }, (_, i) => i + 1),
  ticks: 120,
};
export const QUICK: Pick<SweepOptions, 'seeds' | 'ticks'> = { seeds: [1, 2], ticks: 60 };

export type SweepRow = {
  plan: string;
  mode: CorruptionMode;
  k: number;
  target: TargetKind;
  /** The spaces the target kind resolved to for this plan; null for 'random' (corruptor picks). */
  targetSpaces: SpaceId[] | null;
  seed: number;
  brain: BrainName;
} & Metrics;

export type SweepResult = {
  meta: { startedAt: string; elapsedMs: number; onset: number; ticks: number; plans: string[]; modes: CorruptionMode[]; ks: number[]; targets: TargetKind[]; seeds: number[] };
  rows: SweepRow[];
};

/** Longest edge-path (in hops) from the ignition space; ties broken by id. */
export function farthestSpace(plan: StructurePlan, from: SpaceId): SpaceId {
  const edges = edgeMap(plan);
  const dist = new Map<SpaceId, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges.get(cur) ?? []) {
      if (!dist.has(e.b)) {
        dist.set(e.b, dist.get(cur)! + 1);
        queue.push(e.b);
      }
    }
  }
  const reachable = [...dist.entries()].filter(([id]) => id !== from);
  if (reachable.length === 0) return from;
  reachable.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return reachable[0]![0];
}

/** The ignition space's neighbor that is hottest at tick `onset` of a clean run; ties by id. */
export function hottestNeighborAt(plan: StructurePlan, from: SpaceId, onset: number, seed: number): SpaceId {
  const neighbors = (edgeMap(plan).get(from) ?? []).map((e) => e.b);
  if (neighbors.length === 0) return from;
  const trace = runLoop({ plan, seed, ticks: Math.max(1, onset), brain: createBrain });
  const last = trace[trace.length - 1]!;
  const temp = new Map(last.truth.spaces.map((s) => [s.id, s.temp]));
  return [...neighbors].sort((a, b) => (temp.get(b) ?? -Infinity) - (temp.get(a) ?? -Infinity) || a.localeCompare(b))[0]!;
}

/** Resolve a target kind to a concrete space list (null = let the corruptor choose). */
export function resolveTarget(plan: StructurePlan, kind: TargetKind, onset: number, seed: number): SpaceId[] | null {
  const ignition = plan.ignition[0] ?? plan.spaces[0]?.id ?? '';
  switch (kind) {
    case 'ignition': return [ignition];
    case 'neighbor': return [hottestNeighborAt(plan, ignition, onset, seed)];
    case 'far': return [farthestSpace(plan, ignition)];
    case 'random': return null;
  }
}

export function runSweep(opts: SweepOptions): SweepResult {
  const startedAt = new Date();
  const t0 = Date.now();
  const rows: SweepRow[] = [];
  const total = opts.plans.length * opts.modes.length * opts.ks.length * opts.targets.length * opts.seeds.length;
  let done = 0;
  for (const planName of opts.plans) {
    const plan = loadPlan(planName);
    for (const mode of opts.modes) {
      for (const k of opts.ks) {
        for (const target of opts.targets) {
          for (const seed of opts.seeds) {
            const targetSpaces = resolveTarget(plan, target, opts.onset, seed);
            const corruption: Omit<CorruptionConfig, 'seed'> = {
              mode, k, onset: opts.onset, ambient: plan.ambient,
              ...(targetSpaces ? { target: targetSpaces } : {}),
            };
            const traces = runLoopMulti({ plan, seed, ticks: opts.ticks, corruption, brains: BRAINS, primary: 'ours' });
            for (const brain of Object.keys(BRAINS) as BrainName[]) {
              const m = computeMetrics(traces[brain]!, { onset: opts.onset });
              rows.push({ plan: planName, mode, k, target, targetSpaces, seed, brain, ...m });
            }
            done += 1;
            opts.onCell?.(done, total);
          }
        }
      }
    }
  }
  return {
    meta: { startedAt: startedAt.toISOString(), elapsedMs: Date.now() - t0, onset: opts.onset, ticks: opts.ticks, plans: opts.plans, modes: opts.modes, ks: opts.ks, targets: opts.targets, seeds: opts.seeds },
    rows,
  };
}

/** One aggregated line per (plan, mode, k, target, brain): means over seeds. */
export type Aggregate = {
  plan: string; mode: CorruptionMode; k: number; target: TargetKind; brain: BrainName; seeds: number;
  falseCertainty: number; ambiguityCoverage: number; wrongDispatch: number; estimationError: number;
  /** Mean time to recovery over the seeds that recovered, and how many did. */
  timeToRecovery: number | null; recovered: number;
  computeMsPerTick: number; brierScore: number;
  /** False certainty on probability at 0.9 (see Metrics.falseCertaintyByP). */
  falseCertaintyP90: number;
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function aggregate(rows: SweepRow[]): Aggregate[] {
  const groups = new Map<string, SweepRow[]>();
  for (const r of rows) {
    const key = [r.plan, r.mode, r.k, r.target, r.brain].join('|');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return [...groups.values()].map((g) => {
    const f = g[0]!;
    const ttr = g.map((r) => r.timeToRecovery).filter((x): x is number => x !== null);
    return {
      plan: f.plan, mode: f.mode, k: f.k, target: f.target, brain: f.brain, seeds: g.length,
      falseCertainty: mean(g.map((r) => r.falseCertainty)),
      ambiguityCoverage: mean(g.map((r) => r.ambiguityCoverage)),
      wrongDispatch: mean(g.map((r) => r.wrongDispatch)),
      estimationError: mean(g.map((r) => r.estimationError)),
      timeToRecovery: ttr.length ? mean(ttr) : null,
      recovered: ttr.length,
      computeMsPerTick: mean(g.map((r) => r.computeMsPerTick)),
      brierScore: mean(g.map((r) => r.brierScore)),
      falseCertaintyP90: mean(g.map((r) => r.falseCertaintyByP['0.9'] ?? 0)),
    };
  });
}

/** Cells where ours has higher false certainty or wrong dispatch than the BEST Kalman baseline (naive, gated or source). */
export function whereOursLoses(aggs: Aggregate[]): Array<{ ours: Aggregate; kalman: Aggregate; on: string[] }> {
  const out: Array<{ ours: Aggregate; kalman: Aggregate; on: string[] }> = [];
  const byCell = new Map<string, Partial<Record<BrainName, Aggregate>>>();
  for (const a of aggs) {
    const key = [a.plan, a.mode, a.k, a.target].join('|');
    const cell = byCell.get(key) ?? byCell.set(key, {}).get(key)!;
    cell[a.brain] = a;
  }
  const EPS = 1e-9;
  for (const cell of byCell.values()) {
    const ours = cell.ours;
    const baselines = BASELINES.map((b) => cell[b]).filter((b): b is Aggregate => b !== undefined);
    if (!ours || baselines.length === 0) continue;
    const on: string[] = [];
    const bestFc = baselines.reduce((a, b) => (b.falseCertainty < a.falseCertainty ? b : a));
    const bestWd = baselines.reduce((a, b) => (b.wrongDispatch < a.wrongDispatch ? b : a));
    if (ours.falseCertainty > bestFc.falseCertainty + EPS) on.push(`falseCert ${pct(ours.falseCertainty)} > ${bestFc.brain} ${pct(bestFc.falseCertainty)}`);
    if (ours.wrongDispatch > bestWd.wrongDispatch + EPS) on.push(`wrongDispatch ${pct(ours.wrongDispatch)} > ${bestWd.brain} ${pct(bestWd.wrongDispatch)}`);
    if (on.length) out.push({ ours, kalman: bestFc, on });
  }
  return out;
}

const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;
const ttrText = (a: Aggregate): string => (a.timeToRecovery === null ? `never (0/${a.seeds})` : `${a.timeToRecovery.toFixed(1)} (${a.recovered}/${a.seeds})`);

/** Plain fixed-width text: it goes in a video. */
export function formatSummary(aggs: Aggregate[]): string {
  const cols = ['plan', 'mode', 'k', 'target', 'brain', 'falseCert', 'fc@P.9', 'coverage', 'wrongDisp', 'err C', 'ttr', 'ms/tick'];
  const widths = [12, 10, 3, 9, 13, 10, 7, 9, 10, 7, 16, 8];
  const line = (cells: string[]): string => cells.map((c, i) => (i < 5 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join(' ');
  const out = [line(cols)];
  const sorted = [...aggs].sort((a, b) =>
    a.plan.localeCompare(b.plan) || SWEEP_MODES.indexOf(a.mode) - SWEEP_MODES.indexOf(b.mode) || a.k - b.k ||
    TARGET_KINDS.indexOf(a.target) - TARGET_KINDS.indexOf(b.target) || BRAIN_ORDER.indexOf(a.brain) - BRAIN_ORDER.indexOf(b.brain));
  let lastCell = '';
  for (const a of sorted) {
    const cell = [a.plan, a.mode, a.k, a.target].join('|');
    if (lastCell && cell !== lastCell && a.brain === 'ours') out.push('');
    lastCell = cell;
    out.push(line([a.plan, a.mode, String(a.k), a.target, a.brain, pct(a.falseCertainty), pct(a.falseCertaintyP90), pct(a.ambiguityCoverage), pct(a.wrongDispatch), a.estimationError.toFixed(1), ttrText(a), a.computeMsPerTick.toFixed(2)]));
  }
  return out.join('\n');
}

/**
 * What the k axis can and cannot show, printed under the table so a repeated row is not
 * read as evidence: k is the freeze/blind budget, spent only when the corruptor chooses
 * its own victims (target random). With a single named target space there is one sensor
 * to break, and saturate / flashover follow the fire regardless of k.
 */
export const K_NOTE = 'note: k (freeze/blind budget) only changes the freeze, blind and mixed cells with target=random; with a named target there is one sensor to break, and saturate/flashover ignore k, so those k=1/2/3 rows are identical by construction.';

export function formatLosses(losses: ReturnType<typeof whereOursLoses>): string {
  const out = ['WHERE OURS LOSES'];
  if (losses.length === 0) {
    out.push('  (no aggregated cell where ours has higher false certainty or wrong dispatch than the best Kalman baseline: naive, gated or source)');
    return out.join('\n');
  }
  for (const l of losses) {
    out.push(`  ${l.ours.plan} ${l.ours.mode} k=${l.ours.k} target=${l.ours.target}: ${l.on.join('; ')}` +
      ` | coverage ours ${pct(l.ours.ambiguityCoverage)} vs ${pct(l.kalman.ambiguityCoverage)}, err ${l.ours.estimationError.toFixed(1)} vs ${l.kalman.estimationError.toFixed(1)}`);
  }
  return out.join('\n');
}

/** Write the two JSON files; returns their paths. */
export function writeResults(result: SweepResult, outDir = 'results'): { stamped: string; latest: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = result.meta.startedAt.replace(/[:.]/g, '-');
  const stamped = join(outDir, `sweep-${stamp}.json`);
  const latest = join(outDir, 'sweep-latest.json');
  const body = JSON.stringify(result, null, 1);
  writeFileSync(stamped, body);
  writeFileSync(latest, body);
  return { stamped, latest };
}

// ---- CLI ----

function parseList(v: string | undefined): string[] | undefined {
  return v === undefined ? undefined : v.split(',').map((s) => s.trim()).filter(Boolean);
}
function parseSeeds(v: string | undefined): number[] | undefined {
  if (v === undefined) return undefined;
  const m = /^(\d+)\.\.(\d+)$/.exec(v.trim());
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  }
  return parseList(v)!.map(Number);
}

export function parseSweepArgs(argv: string[]): SweepOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const quick = argv.includes('--quick');
  const opts: SweepOptions = { ...DEFAULTS, ...(quick ? QUICK : {}) };
  const plans = parseList(get('--plans'));
  if (plans) {
    for (const p of plans) loadPlan(p); // fail loudly on a typo
    opts.plans = plans;
  }
  const modes = parseList(get('--modes'));
  if (modes) {
    for (const m of modes) if (!(SWEEP_MODES as string[]).includes(m)) throw new Error(`--modes ${m}: expected one of ${SWEEP_MODES.join(', ')}`);
    opts.modes = modes as CorruptionMode[];
  }
  const ks = parseList(get('--k'));
  if (ks) opts.ks = ks.map(Number);
  const targets = parseList(get('--targets'));
  if (targets) {
    for (const t of targets) if (!(TARGET_KINDS as string[]).includes(t)) throw new Error(`--targets ${t}: expected one of ${TARGET_KINDS.join(', ')}`);
    opts.targets = targets as TargetKind[];
  }
  const onset = get('--onset');
  if (onset !== undefined) opts.onset = Number(onset);
  const seeds = parseSeeds(get('--seeds'));
  if (seeds) opts.seeds = seeds;
  const ticks = get('--ticks');
  if (ticks !== undefined) opts.ticks = Number(ticks);
  const out = get('--out');
  if (out !== undefined) opts.outDir = out;
  // Fail loudly: a typo must not become NaN in the results or an empty grid on disk.
  for (const [name, v] of [['plans', opts.plans], ['modes', opts.modes], ['targets', opts.targets]] as const) {
    if (v.length === 0) throw new Error(`--${name}: expected at least one value`);
  }
  if (opts.ks.length === 0 || opts.ks.some((x) => !Number.isInteger(x) || x < 1)) throw new Error('--k: expected positive integers');
  if (opts.seeds.length === 0 || opts.seeds.some((x) => !Number.isInteger(x))) throw new Error('--seeds: expected integers, e.g. 1..10 or 1,3,5');
  if (!Number.isInteger(opts.onset) || opts.onset < 0) throw new Error('--onset: expected a non-negative integer');
  if (!Number.isInteger(opts.ticks) || opts.ticks < 1) throw new Error('--ticks: expected a positive integer');
  return opts;
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const opts = parseSweepArgs(process.argv.slice(2));
  const cells = opts.plans.length * opts.modes.length * opts.ks.length * opts.targets.length * opts.seeds.length;
  console.log(`sweep  plans=${opts.plans.join(',')}  modes=${opts.modes.join(',')}  k=${opts.ks.join(',')}  targets=${opts.targets.join(',')}  onset=${opts.onset}  seeds=${opts.seeds.join(',')}  ticks=${opts.ticks}  cells=${cells} x ${BRAIN_ORDER.length} brains`);
  let lastPrinted = 0;
  const result = runSweep({
    ...opts,
    onCell: (done, total) => {
      if (done - lastPrinted >= Math.max(1, Math.floor(total / 10)) || done === total) {
        lastPrinted = done;
        process.stdout.write(`  ${done}/${total} cells\n`);
      }
    },
  });
  const aggs = aggregate(result.rows);
  console.log('');
  console.log(formatSummary(aggs));
  console.log('');
  console.log(K_NOTE);
  console.log('');
  console.log(formatLosses(whereOursLoses(aggs)));
  const paths = writeResults(result, opts.outDir);
  console.log(`\nwrote ${paths.stamped} and ${paths.latest}  (${result.rows.length} rows, ${(result.meta.elapsedMs / 1000).toFixed(1)} s)`);
}
