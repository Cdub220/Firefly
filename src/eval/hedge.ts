/**
 * src/eval — owned by Dean.
 *
 * `npm run hedge`: the checkpoint-4 behaviour, made reproducible. Flashover on the ignition
 * space, k=2, on the largest plan, with 2 scouts + 2 tethers + 1 retardant, closed loop.
 * Prints, per tick from onset to onset+20: the ambiguous groups, every drone's command,
 * and the true burning set; then hedgeRate and containmentDelta. Saved to
 * results/hedge-cp4.txt.
 *
 *   npm run hedge                       the prompt's configuration -> results/hedge-cp4.txt
 *   npm run hedge -- --mode blind       -> results/hedge-cp4-vessel-3x8-blind-1.txt (never clobbers the CP4 artifact)
 *   npm run hedge -- --plan demo-6 --seed 3 --ticks 80 --mode freeze --k 1
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import type { CorruptionConfig, CorruptionMode, WorldConfig } from '../shared/types';
import { runContainment, type ContainmentRun } from './containment';
import { computeMetrics, isHedge } from './metrics';

export const HEDGE_MODES: readonly CorruptionMode[] = ['none', 'freeze', 'blind', 'saturate', 'flashover', 'mixed'];

export const HEDGE_ROSTER: NonNullable<WorldConfig['drones']> = [
  { id: 'D1', class: 'scout', at: '' },
  { id: 'D2', class: 'scout', at: '' },
  { id: 'D3', class: 'tether', at: '' },
  { id: 'D4', class: 'tether', at: '' },
  { id: 'D5', class: 'retardant', at: '' },
];

/** The plan with the most spaces; ties by name. */
export function largestPlanName(names: readonly string[] = PLAN_NAMES): string {
  return [...names].sort((a, b) => loadPlan(b).spaces.length - loadPlan(a).spaces.length || a.localeCompare(b))[0]!;
}

export type HedgeOptions = { plan: string; seed: number; ticks: number; mode: CorruptionMode; k: number; onset: number };
export const HEDGE_DEFAULTS: HedgeOptions = { plan: largestPlanName(), seed: 1, ticks: 60, mode: 'flashover', k: 2, onset: 5 };

export type HedgeReport = { text: string; hedgeRate: number; containmentDelta: number; run: ContainmentRun; hedgedTicks: number[] };

export function hedgeReport(o: HedgeOptions): HedgeReport {
  const plan = loadPlan(o.plan);
  const home = plan.resupply[0] ?? plan.spaces[0]!.id;
  const corruption: Omit<CorruptionConfig, 'seed'> = o.mode === 'none' ? { mode: 'none' } : { mode: o.mode, k: o.k, onset: o.onset, target: [plan.ignition[0]!], ambient: plan.ambient };
  const run = runContainment({ plan, seed: o.seed, ticks: o.ticks, corruption, drones: HEDGE_ROSTER.map((d) => ({ ...d, at: home })) });
  const m = computeMetrics(run.withAllocator, { onset: o.onset });
  const lines: string[] = [];
  const first = run.withAllocator[0]!;
  lines.push(`hedge-cp4  plan=${o.plan}  mode=${o.mode}  k=${o.k}  onset=${o.onset}  seed=${o.seed}  ticks=${o.ticks}  target=${plan.ignition[0]}  roster=${first.truth.drones.map((d) => `${d.id}:${d.class}`).join(',')} at ${home}`);
  lines.push('');
  lines.push(`${'t'.padStart(4)}  ${'ambiguous'.padEnd(34)}  ${'commands'.padEnd(80)}  truth burning`);
  for (const rec of run.withAllocator) {
    if (rec.t < o.onset || rec.t > o.onset + 20) continue;
    const amb = rec.belief.ambiguous.map((g) => `{${g.join(',')}}`).join(' ') || '-';
    const cmds = rec.commands.map((c) => `${c.droneId}->${c.goTo} ${c.task}`).join('  ') || '-';
    const truth = rec.truth.spaces.filter((s) => s.burning).map((s) => s.id).join(',') || '-';
    lines.push(`${String(rec.t).padStart(4)}  ${amb.padEnd(34)}  ${cmds.padEnd(80)}  [${truth}]`);
  }
  lines.push('');
  const last = (t: typeof run.withAllocator): number => t[t.length - 1]!.truth.spaces.filter((s) => s.burning).length;
  // Where the hedges are, so nobody has to read the table to find out whether the window
  // above shows one: tick, whether the fire was still burning, whether it is in the window.
  const hedgedTicks = run.withAllocator.filter((r) => r.belief.ambiguous.length > 0 && isHedge(r.belief.ambiguous, r.commands)).map((r) => r.t);
  const burningAt = new Map(run.withAllocator.map((r) => [r.t, r.truth.spaces.some((s) => s.burning)]));
  const mark = (t: number): string => `${t}${burningAt.get(t) ? '' : ' (fire already out)'}${t >= o.onset && t <= o.onset + 20 ? '' : ' (outside the window)'}`;
  lines.push(`hedgeRate = ${(100 * m.hedgeRate).toFixed(0)}% of ticks (ambiguous belief AND commands split across one ambiguous group)`);
  lines.push(`  hedged ticks: ${hedgedTicks.length ? hedgedTicks.map(mark).join(', ') : 'none'}`);
  if (!hedgedTicks.some((t) => burningAt.get(t) && t >= o.onset && t <= o.onset + 20)) {
    lines.push('  NO hedge inside the printed window while the fire burns on this configuration; see docs/decisions.md (Sun hour 24) for the configurations that do.');
  }
  // Diagnostic, broader reading: the estimator groups ambiguous spaces into connected
  // components, so the two sides of an S2-or-S4 ambiguity are two singleton groups and
  // covering both is not a hedge by the definition above. Count that too.
  const window = run.withAllocator.filter((r) => r.t >= o.onset);
  const spread = window.filter((r) => {
    const amb = new Set(r.belief.ambiguous.flat());
    return amb.size >= 2 && new Set(r.commands.filter((c) => amb.has(c.goTo)).map((c) => c.goTo)).size >= 2;
  }).length;
  lines.push(`  (commands covering two or more ambiguous spaces across ALL groups: ${window.length ? (100 * spread / window.length).toFixed(0) : 0}% of ticks)`);
  lines.push(`containmentDelta = ${run.containmentDelta} spaces burning at tick ${o.ticks}: with allocator ${last(run.withAllocator)}, null allocator ${last(run.nullAllocator)}`);
  const deaths = run.withAllocator[run.withAllocator.length - 1]!.truth.drones.filter((d) => !d.alive).map((d) => `${d.id}:${d.class}`);
  lines.push(`drone deaths with allocator: ${deaths.length ? deaths.join(', ') : 'none'}`);
  return { text: lines.join('\n'), hedgeRate: m.hedgeRate, containmentDelta: run.containmentDelta, run, hedgedTicks };
}

/** results/hedge-cp4.txt for the prompt's configuration; a config-stamped name otherwise, so the CP4 artifact is never clobbered. */
export function hedgeOutputPath(o: HedgeOptions): string {
  const isDefault = (Object.keys(HEDGE_DEFAULTS) as (keyof HedgeOptions)[]).every((k) => o[k] === HEDGE_DEFAULTS[k]);
  return isDefault ? 'results/hedge-cp4.txt' : `results/hedge-cp4-${o.plan}-${o.mode}-${o.seed}${o.k === HEDGE_DEFAULTS.k ? '' : `-k${o.k}`}${o.ticks === HEDGE_DEFAULTS.ticks ? '' : `-${o.ticks}t`}.txt`;
}

export function parseHedgeArgs(argv: string[]): HedgeOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const o: HedgeOptions = { ...HEDGE_DEFAULTS };
  const plan = get('--plan');
  if (plan !== undefined) {
    loadPlan(plan);
    o.plan = plan;
  }
  const mode = get('--mode');
  if (mode !== undefined) {
    if (!(HEDGE_MODES as string[]).includes(mode)) throw new Error(`--mode ${mode}: expected one of ${HEDGE_MODES.join(', ')}`);
    o.mode = mode as CorruptionMode;
  }
  for (const [flag, key] of [['--seed', 'seed'], ['--ticks', 'ticks'], ['--k', 'k'], ['--onset', 'onset']] as const) {
    const v = get(flag);
    if (v !== undefined) {
      const n = Number(v);
      const min = key === 'ticks' || key === 'k' ? 1 : 0;
      if (!Number.isInteger(n) || n < min) throw new Error(`${flag}: expected an integer >= ${min}`);
      o[key] = n;
    }
  }
  return o;
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const o = parseHedgeArgs(process.argv.slice(2));
  const { text } = hedgeReport(o);
  console.log(text);
  mkdirSync('results', { recursive: true });
  const path = hedgeOutputPath(o);
  writeFileSync(path, text + '\n');
  console.log(`\nwrote ${path}`);
}
