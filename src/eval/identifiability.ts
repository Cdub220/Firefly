/**
 * src/eval — owned by Dean.
 *
 * The identifiability result (CP5 prompt 1): one specific pair of fire states that the
 * sensor set provably cannot distinguish, what each brain does about it, what the
 * ambiguity costs in drone-ticks and containment, and the one extra sensor that resolves
 * it. `npm run ident` prints the report and writes results/identifiability.txt.
 *
 * The plans live in data/ident/ (not data/structures, which is Chase's) and are imported
 * here directly rather than registered in the plan registry.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createBrain } from '../brain';
import { createKalmanBrain, createSourceKalmanBrain } from '../brain/kalman';
import { score } from '../brain/hypotheses';
import { SIGMA_C, steadyState } from '../brain/physics';
import { runLoop, runLoopMulti, type BrainFactory, type TickRecord } from '../loop';
import type { CorruptionConfig, Reading, SpaceId, StructurePlan, WorldConfig } from '../shared/types';
import identJson from '../../data/ident/ident-7.json';
import fixedJson from '../../data/ident/ident-7-fixed.json';
import { computeMetrics } from './metrics';

export const IDENT_PLAN = identJson as StructurePlan;
export const IDENT_FIXED_PLAN = fixedJson as StructurePlan;
export const H1: ReadonlySet<SpaceId> = new Set(['A1']);
export const H2: ReadonlySet<SpaceId> = new Set(['B1']);
/** Two hypotheses are indistinguishable when every sensor differs by less than this. */
export const INDISTINGUISHABLE_C = 2 * SIGMA_C;
export const IDENT_BRAINS: Record<string, BrainFactory> = { ours: createBrain, kalman: createKalmanBrain, 'kalman-source': createSourceKalmanBrain };
export const IDENT_ROSTER: NonNullable<WorldConfig['drones']> = [
  { id: 'D1', class: 'scout', at: '' },
  { id: 'D2', class: 'scout', at: '' },
  { id: 'D3', class: 'tether', at: '' },
];
const TICKS = 60;
const ONSET = 5;
const SEED = 1;

const f1 = (x: number): string => x.toFixed(1);
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;

/** Step 1: steady-state temperature at every sensor under H1 and H2, and the largest gap. */
export function measurementTable(plan: StructurePlan): { rows: Array<{ sensor: string; space: SpaceId; h1: number; h2: number }>; maxDiff: number } {
  const s1 = steadyState(plan, new Set(H1));
  const s2 = steadyState(plan, new Set(H2));
  const rows = plan.sensors.map((s) => ({ sensor: s.id, space: s.spaceId, h1: s1[s.spaceId]!, h2: s2[s.spaceId]! }));
  return { rows, maxDiff: rows.reduce((m, r) => Math.max(m, Math.abs(r.h1 - r.h2)), 0) };
}

/**
 * Step 2: for each sensor, remove it and score H1 and H2 (the brain's own residual rule,
 * k largest downward residuals dropped) against the readings truth H1 would produce at
 * steady state. Sensors whose removal leaves the two scores equal are the ones a k=1
 * freeze or blinding would need to hit.
 */
export function removalAnalysis(plan: StructurePlan, k = 1): Array<{ removed: string; s1: number; s2: number; identical: boolean }> {
  const truth = steadyState(plan, new Set(H1));
  const readings: Reading[] = plan.sensors.map((s) => ({ sensorId: s.id, source: 'fixed', spaceId: s.spaceId, temp: truth[s.spaceId]!, t: 1 }));
  return plan.sensors.map((s) => {
    const rest = readings.filter((r) => r.sensorId !== s.id);
    // Rolling from a hypothesis's own steady state keeps it at that steady state.
    const a = score(plan, new Set(H1), rest, steadyState(plan, new Set(H1)), k, 1).s;
    const b = score(plan, new Set(H2), rest, steadyState(plan, new Set(H2)), k, 1).s;
    return { removed: s.id, s1: a, s2: b, identical: Math.abs(a - b) < INDISTINGUISHABLE_C };
  });
}

const wingOf = (id: SpaceId): 'A' | 'B' | null => (id.startsWith('A') ? 'A' : id.startsWith('B') ? 'B' : null);
const burningIds = (r: TickRecord): SpaceId[] => r.truth.spaces.filter((s) => s.burning).map((s) => s.id);

/** What a brain says about the two wings at one tick. */
function wingVerdict(r: TickRecord): string {
  const named = r.belief.burningSet.filter((id) => wingOf(id) !== null);
  const amb = r.belief.ambiguous.filter((g) => g.some((id) => wingOf(id) !== null)).map((g) => `{${g.join(',')}}`);
  const pick = named.length === 0 ? 'neither wing' : named.every((id) => wingOf(id) === 'A') ? 'A wing (H1)' : named.every((id) => wingOf(id) === 'B') ? 'B wing (H2)' : 'both wings';
  return `${pick}; burningSet [${r.belief.burningSet.join(',') || '-'}]${amb.length ? `; ambiguous ${amb.join(' ')}` : ''}; conf ${r.belief.confidence.toFixed(2)}`;
}

export type OpenLoopRun = { label: string; traces: Record<string, TickRecord[]>; onset: number };

/** Step 3: every brain on one observation stream, truth = H1. */
export function openLoop(plan: StructurePlan, corruption: Omit<CorruptionConfig, 'seed'>, label: string): OpenLoopRun {
  const traces = runLoopMulti({ plan, seed: SEED, ticks: TICKS, corruption, brains: IDENT_BRAINS, primary: 'ours' });
  return { label, traces, onset: corruption.mode === 'none' ? 0 : (corruption.onset ?? ONSET) };
}

function formatOpenLoop(run: OpenLoopRun, lines: string[]): void {
  lines.push(`  ${run.label}`);
  const ours = run.traces['ours']!;
  for (const t of [5, 10, 20, 30, 40]) {
    const i = t - 1;
    const truth = burningIds(ours[i]!);
    lines.push(`    t=${String(t).padStart(2)}  truth [${truth.join(',')}]  P=${f1(ours[i]!.truth.spaces.find((s) => s.id === 'P')!.temp)} C`);
    for (const name of Object.keys(IDENT_BRAINS)) lines.push(`         ${name.padEnd(14)} ${wingVerdict(run.traces[name]![i]!)}`);
  }
  const pIgnites = ours.find((r) => burningIds(r).includes('P'));
  const merged = ours.find((r) => burningIds(r).some((id) => wingOf(id) === 'B'));
  lines.push(`    (the passage P itself ignites at tick ${pIgnites ? pIgnites.t : 'never'} and the fire reaches the B wing at tick ${merged ? merged.t : 'never'}: the pair is only a pair before then)`);
  lines.push(`    metrics over ticks >= ${run.onset} (the whole run):`);
  for (const name of Object.keys(IDENT_BRAINS)) {
    const m = computeMetrics(run.traces[name]!, { onset: run.onset });
    lines.push(`         ${name.padEnd(14)} falseCertainty ${pct(m.falseCertainty)}  wrongDispatch ${pct(m.wrongDispatch)}  coverage ${pct(m.ambiguityCoverage)}  fc@P.9 ${pct(m.falseCertaintyByP['0.9'] ?? 0)}`);
  }
}

export type ClosedLoopCost = { droneTicks: Record<'A' | 'B', number>; scoutTicks: Record<'A' | 'B', number>; burningAt30: number; burningAt60: number; everBurned: number; firstScoutIn: Record<'A' | 'B', number | null>; resolvedAt: number | null; trace: TickRecord[] };

/** Step 4: closed loop, two scouts and a tether from the resupply space. */
export function closedLoopCost(plan: StructurePlan): ClosedLoopCost {
  const home = plan.resupply[0]!;
  const trace = runLoop({ plan, seed: SEED, ticks: TICKS, dispatch: true, drones: IDENT_ROSTER.map((d) => ({ ...d, at: home })) });
  const droneTicks = { A: 0, B: 0 };
  const scoutTicks = { A: 0, B: 0 };
  const firstScoutIn: Record<'A' | 'B', number | null> = { A: null, B: null };
  for (const r of trace) {
    for (const d of r.truth.drones) {
      const w = wingOf(d.at);
      if (!w) continue;
      droneTicks[w] += 1;
      if (d.class === 'scout') {
        scoutTicks[w] += 1;
        firstScoutIn[w] ??= r.t;
      }
    }
  }
  const at = (t: number): number => burningIds(trace[t - 1]!).length;
  // Resolved: A1 named burning with no ambiguous group touching the B wing.
  const resolved = trace.find((r) => r.belief.burningSet.includes('A1') && !r.belief.ambiguous.some((g) => g.some((id) => wingOf(id) === 'B')));
  return { droneTicks, scoutTicks, burningAt30: at(30), burningAt60: at(60), everBurned: new Set(trace.flatMap(burningIds)).size, firstScoutIn, resolvedAt: resolved ? resolved.t : null, trace };
}

/** A tick where ours still keeps the B wing in play (named or ambiguous) while truth is H1 alone. */
const bWingInPlay = (r: TickRecord): boolean => r.belief.burningSet.some((id) => wingOf(id) === 'B') || r.belief.ambiguous.some((g) => g.some((id) => wingOf(id) === 'B'));

/**
 * Step 5: when ours settles on A1. First tick that names A1 with nothing in the B wing in
 * play, and how many ticks up to `until` (before the passage can ignite) the B wing stays
 * in play: 0 means resolved for good, ~all means never resolved.
 */
export function resolution(traces: Record<string, TickRecord[]>, until = 40): { firstTick: number | null; bWingTicks: number } {
  const ours = traces['ours']!;
  const r = ours.find((x) => x.belief.burningSet.includes('A1') && !bWingInPlay(x));
  return { firstTick: r ? r.t : null, bWingTicks: ours.filter((x) => x.t <= until && bWingInPlay(x)).length };
}

export function identifiabilityReport(): string {
  const lines: string[] = [];
  lines.push('IDENTIFIABILITY: two fire states the sensor set cannot tell apart');
  lines.push(`plan ${IDENT_PLAN.name}: ${IDENT_PLAN.spaces.length} spaces, sensors at ${IDENT_PLAN.sensors.map((s) => s.spaceId).join(', ')}; H1 = {${[...H1]}} (truth), H2 = {${[...H2]}}; sigma = ${SIGMA_C} C`);
  lines.push('');
  lines.push('   P is a central passage; two mirror-image wings hang off it (A1-A2 and B1-B2, no sensors);');
  lines.push('   Q and R lead away from P. Edge rates are identical on both wings.');
  lines.push('');
  lines.push('      A2 --door-- A1 --bulkhead-- P --bulkhead-- B1 --door-- B2');
  lines.push('                                  |');
  lines.push('                               passage');
  lines.push('                                  |');
  lines.push('                                  Q --door-- R (resupply)');
  lines.push('                              [FP] [FQ] [FR] fixed sensors');
  lines.push('');

  // Step 1
  lines.push('STEP 1  steady-state temperature at every sensor (the brain\'s steadyState(), which stops iterating at 0.5 C per tick, so a few C under the exact fixed point; symmetric either way)');
  const t1 = measurementTable(IDENT_PLAN);
  lines.push(`  ${'sensor'.padEnd(8)}${'space'.padEnd(7)}${'H1={A1}'.padStart(10)}${'H2={B1}'.padStart(10)}${'|diff|'.padStart(9)}`);
  for (const r of t1.rows) lines.push(`  ${r.sensor.padEnd(8)}${r.space.padEnd(7)}${f1(r.h1).padStart(10)}${f1(r.h2).padStart(10)}${f1(Math.abs(r.h1 - r.h2)).padStart(9)}`);
  lines.push(`  max |difference| over sensors = ${f1(t1.maxDiff)} C  (threshold 2 sigma = ${INDISTINGUISHABLE_C} C)`);
  if (t1.maxDiff < INDISTINGUISHABLE_C) {
    lines.push('  => No estimator can distinguish H1 from H2 with this sensor set, ours included: the two fire states produce');
    lines.push('     measurement vectors that differ by less than the sensor noise at every sensor, so any decision between');
    lines.push('     them is a coin toss dressed as an inference. (Exactly equal here: swapping the wings is a symmetry of');
    lines.push('     the plan that fixes every sensor.)');
  } else {
    lines.push('  => distinguishable: some sensor differs by more than the noise.');
  }
  lines.push('');

  // Step 2
  lines.push('STEP 2  which sensor a k=1 corruption would need to hit (the brain\'s own residual rule, one downward residual droppable)');
  const rem = removalAnalysis(IDENT_PLAN);
  for (const r of rem) lines.push(`  remove ${r.removed.padEnd(4)} score(H1) ${f1(r.s1).padStart(6)}  score(H2) ${f1(r.s2).padStart(6)}  ${r.identical ? 'identical' : 'distinguishable'}`);
  lines.push(`  => on ${IDENT_PLAN.name} the scores are already identical with every sensor present: no single sensor carries the`);
  lines.push('     distinction, so a k=1 attacker needs to hit nothing. The freeze runs below target FP, the only sensor that');
  lines.push('     carries any fire signal at all.');
  const remFixed = removalAnalysis(IDENT_FIXED_PLAN);
  const critical = remFixed.filter((r) => r.identical).map((r) => r.removed);
  lines.push(`  on ${IDENT_FIXED_PLAN.name} (step 5's plan) the sensor whose removal makes them identical again: ${critical.join(', ') || 'none'}`);
  for (const r of remFixed) lines.push(`  remove ${r.removed.padEnd(4)} score(H1) ${f1(r.s1).padStart(6)}  score(H2) ${f1(r.s2).padStart(6)}  ${r.identical ? 'identical' : 'distinguishable'}`);
  lines.push('');

  // Step 3
  lines.push(`STEP 3  what each brain does, open loop, truth = H1, seed ${SEED}, ${TICKS} ticks`);
  const base = [
    openLoop(IDENT_PLAN, { mode: 'none' }, 'mode none'),
    openLoop(IDENT_PLAN, { mode: 'freeze', k: 1, onset: ONSET, target: ['P'], ambient: IDENT_PLAN.ambient }, `mode freeze on FP (space P) from tick ${ONSET}`),
  ];
  for (const run of base) formatOpenLoop(run, lines);
  lines.push('  => desired outcome: the baselines commit, ours hedges. Read the verdicts above; the numbers are not tuned.');
  lines.push('');

  // Step 4
  lines.push(`STEP 4  operational cost, closed loop (dispatch on), roster ${IDENT_ROSTER.map((d) => `${d.id}:${d.class}`).join(', ')} from ${IDENT_PLAN.resupply[0]}`);
  const c0 = closedLoopCost(IDENT_PLAN);
  const c1 = closedLoopCost(IDENT_FIXED_PLAN);
  const costLine = (name: string, c: ClosedLoopCost): void => {
    lines.push(`  ${name.padEnd(14)} drone-ticks in A wing ${String(c.droneTicks.A).padStart(4)}, in B wing ${String(c.droneTicks.B).padStart(4)} (scouts ${c.scoutTicks.A}/${c.scoutTicks.B});` +
      ` first scout enters A at t=${c.firstScoutIn.A ?? 'never'}, B at t=${c.firstScoutIn.B ?? 'never'}; belief resolved to A1 at t=${c.resolvedAt ?? 'never'}`);
    lines.push(`  ${''.padEnd(14)} burning at t=30: ${c.burningAt30}, at t=60: ${c.burningAt60}; spaces ever burned: ${c.everBurned}`);
    const firstCmds = c.trace[1]!.commands.map((x) => `${x.droneId}->${x.goTo} ${x.task}`).join('  ');
    lines.push(`  ${''.padEnd(14)} commands at t=2: ${firstCmds}`);
  };
  costLine(IDENT_PLAN.name, c0);
  costLine(IDENT_FIXED_PLAN.name, c1);
  lines.push(`  => the ambiguity costs ${c0.droneTicks.B - c1.droneTicks.B} drone-ticks in the wing that is not burning (${c0.droneTicks.B} vs ${c1.droneTicks.B}).`);
  lines.push('');

  // Step 5
  lines.push(`STEP 5  resolution: ${IDENT_FIXED_PLAN.name} = the same plan plus one fixed sensor in A1`);
  const t5 = measurementTable(IDENT_FIXED_PLAN);
  lines.push(`  ${'sensor'.padEnd(8)}${'space'.padEnd(7)}${'H1={A1}'.padStart(10)}${'H2={B1}'.padStart(10)}${'|diff|'.padStart(9)}`);
  for (const r of t5.rows) lines.push(`  ${r.sensor.padEnd(8)}${r.space.padEnd(7)}${f1(r.h1).padStart(10)}${f1(r.h2).padStart(10)}${f1(Math.abs(r.h1 - r.h2)).padStart(9)}`);
  lines.push(`  max |difference| over sensors = ${f1(t5.maxDiff)} C  (was ${f1(t1.maxDiff)})`);
  const fixedRuns = [
    openLoop(IDENT_FIXED_PLAN, { mode: 'none' }, 'mode none'),
    openLoop(IDENT_FIXED_PLAN, { mode: 'freeze', k: 1, onset: ONSET, target: ['A1'], ambient: IDENT_FIXED_PLAN.ambient }, `mode freeze on FA1 (the resolving sensor) from tick ${ONSET}`),
    openLoop(IDENT_FIXED_PLAN, { mode: 'blind', k: 1, onset: ONSET, target: ['A1'], ambient: IDENT_FIXED_PLAN.ambient }, `mode blind on FA1 (the resolving sensor) from tick ${ONSET}`),
  ];
  for (const run of fixedRuns) {
    formatOpenLoop(run, lines);
    const res = resolution(run.traces);
    lines.push(`    ours first names A1 with nothing in the B wing in play at tick ${res.firstTick ?? 'never'}; ticks 1-40 with the B wing still in play: ${res.bWingTicks}`);
  }
  const baseRes = resolution(base[0]!.traces);
  lines.push(`  (for comparison, on ${IDENT_PLAN.name} mode none the B wing is in play on ${baseRes.bWingTicks} of ticks 1-40 and A1 is never named alone: ${baseRes.firstTick === null ? 'never resolved' : `first at tick ${baseRes.firstTick}`})`);
  lines.push('  => one sensor in A1 resolves the pair; a k=1 corruption of that one sensor is enough to take the resolution away again.');
  return lines.join('\n');
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const text = identifiabilityReport();
  console.log(text);
  mkdirSync('results', { recursive: true });
  writeFileSync('results/identifiability.txt', text + '\n');
  console.log('\nwrote results/identifiability.txt');
}
