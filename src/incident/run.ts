/**
 * `npm run incident` — the incident replay numbers (docs/10-incident-replay-plan.md step 5).
 *
 * Row A, situational awareness: on the as-built sensors and on a fully instrumented
 * building, each brain runs OPEN LOOP on the calibrated plan with the real failure
 * (sensors die when their space passes the flashover temperature). For every floor, the
 * minute the brain first named a space on it as burning is set against the minute the
 * floor actually caught (sim truth) and the minute the 1991 commander was told (record).
 *
 * Row B, containment counterfactual: the same fire CLOSED LOOP, Dean's allocator driving
 * the default drone roster from the staging floor under three beliefs (ours, the naive
 * Kalman, the 1991 commander's knowledge), against the uncontrolled run and the record.
 *
 *   npm run incident                       # writes data/incidents/<slug>/results.json and results/incident-<slug>.md
 *   npm run incident -- --seed 7 --minutes 900
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createBrain } from '../brain';
import { createKalmanBrain, createKalmanDispatching, withAllocator } from '../brain/kalman';
import { computeMetrics } from '../eval/metrics';
import { runLoop, type BrainFactory } from '../loop';
import { loadPlan } from '../shared/structures';
import type { StructurePlan } from '../shared/types';
import { runUncontrolled, TICK_MINUTES } from './calibration';
import { createCommander, type KnowledgeStage } from './commander';
import { certainAt, firstBurningByFloor, firstNamedByFloor, knownAtFromStages } from './floors';

export type IncidentTimeline = {
  slug: string; name: string; tickMinutes: number;
  events: Array<{ minute: number; kind: string; text: string; floors?: number[]; estimated?: boolean }>;
  commanderKnowledge: KnowledgeStage[];
  outcome: { floorsDestroyed: number[]; durationMinutes: number; firefighterDeaths: number };
};

export type AwarenessRow = {
  brain: string; sensors: 'as-built' | 'instrumented';
  /** Minute the brain first named any space of the floor as burning, by floor; absent = never. */
  namedAt: Record<number, number>;
  /** Minute the fire floor was first named with confidence >= 0.9, or null. */
  certainAt: number | null;
  /** From computeMetrics over the whole run. */
  falseCertainty: number; wrongDispatch: number; ambiguityCoverage: number; estimationError: number;
};
export type ContainmentRow = { driver: string; fireVolumeMinutes: number; floorsBurned: number[]; lastFire: number | null; peakBurning: number; droneDeaths: number };
export type IncidentResults = {
  slug: string; seed: number; minutes: number; tickMinutes: number; generatedBy: string;
  truth: { firstBurning: Record<number, number>; lastFire: number | null; fireVolumeMinutes: number };
  record: { knownAt: Record<number, number>; floorsDestroyed: number[]; durationMinutes: number };
  awareness: AwarenessRow[];
  containment: ContainmentRow[];
};

const FIRE_FLOOR = 22;
const OPEN_LOOP_CORRUPTION = { mode: 'flashover' as const, onset: 1 };

export function runIncident(opts: { slug: string; seed: number; minutes: number; dir?: string }): IncidentResults {
  const dir = opts.dir ?? `data/incidents/${opts.slug}`;
  const timeline = JSON.parse(readFileSync(`${dir}/timeline.json`, 'utf8')) as IncidentTimeline;
  const tickMinutes = timeline.tickMinutes ?? TICK_MINUTES;
  const ticks = Math.ceil(opts.minutes / tickMinutes);
  const asBuilt = loadPlan('highrise-12x9');
  const instrumented = loadPlan('highrise-12x9-instrumented');
  const commander = createCommander(timeline.commanderKnowledge, tickMinutes);
  const brains: Record<string, BrainFactory> = { ours: createBrain, kalman: createKalmanBrain, commander };

  const uncontrolled = runUncontrolled(asBuilt, opts.minutes, opts.seed, tickMinutes);
  const awareness: AwarenessRow[] = [];
  for (const [sensors, plan] of [['as-built', asBuilt], ['instrumented', instrumented]] as const) {
    for (const [name, brain] of Object.entries(brains)) {
      const trace = runLoop({ plan, seed: opts.seed, ticks, brain, corruption: OPEN_LOOP_CORRUPTION, dispatch: false });
      const m = computeMetrics(trace, { onset: 1 });
      awareness.push({
        brain: name, sensors, namedAt: firstNamedByFloor(trace, tickMinutes), certainAt: certainAt(trace, tickMinutes, FIRE_FLOOR),
        falseCertainty: m.falseCertainty, wrongDispatch: m.wrongDispatch, ambiguityCoverage: m.ambiguityCoverage, estimationError: m.estimationError,
      });
    }
  }
  const drivers: Record<string, BrainFactory> = { ours: createBrain, kalman: createKalmanDispatching, commander: withAllocator(commander) };
  const containment: ContainmentRow[] = [{ driver: 'nobody (uncontrolled)', fireVolumeMinutes: uncontrolled.fireVolumeMinutes, floorsBurned: Object.keys(uncontrolled.firstBurning).map(Number).sort((a, b) => a - b), lastFire: uncontrolled.lastFire, peakBurning: uncontrolled.peakBurning, droneDeaths: 0 }];
  for (const [name, brain] of Object.entries(drivers)) {
    const trace = runLoop({ plan: asBuilt, seed: opts.seed, ticks, brain, corruption: OPEN_LOOP_CORRUPTION, dispatch: true });
    const burning = trace.map((r) => r.truth.spaces.filter((s) => s.burning).length);
    const lastIdx = burning.map((n, i) => (n > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const last = trace[trace.length - 1]!;
    containment.push({
      driver: name, fireVolumeMinutes: burning.reduce((a, b) => a + b, 0) * tickMinutes,
      floorsBurned: Object.keys(firstBurningByFloor(trace, tickMinutes)).map(Number).sort((a, b) => a - b),
      lastFire: lastIdx >= 0 ? (lastIdx + 1) * tickMinutes : null, peakBurning: Math.max(0, ...burning),
      droneDeaths: last.truth.drones.filter((d) => !d.alive).length,
    });
  }
  const truthTrace = runLoop({ plan: asBuilt, seed: opts.seed, ticks, brain: commander, dispatch: false });
  return {
    slug: opts.slug, seed: opts.seed, minutes: opts.minutes, tickMinutes, generatedBy: 'npm run incident (src/incident/run.ts)',
    truth: { firstBurning: firstBurningByFloor(truthTrace, tickMinutes), lastFire: uncontrolled.lastFire, fireVolumeMinutes: uncontrolled.fireVolumeMinutes },
    record: { knownAt: knownAtFromStages(timeline.commanderKnowledge), floorsDestroyed: timeline.outcome.floorsDestroyed, durationMinutes: timeline.outcome.durationMinutes },
    awareness, containment,
  };
}

const fmtMin = (m: number | null | undefined): string => (m === null || m === undefined ? 'never' : `${m}`);
const pct = (v: number): string => `${Math.round(v * 100)}%`;

export function renderIncidentMarkdown(r: IncidentResults, plan: StructurePlan = loadPlan('highrise-12x9')): string {
  // Every floor of the plan, including the ones that never burn: a brain naming those is a finding, not noise.
  const floors = [...new Set(plan.spaces.map((s) => s.level))].sort((a, b) => a - b);
  const lines: string[] = [];
  lines.push(`# Incident replay · ${r.slug} · seed ${r.seed} · ${r.minutes} min at ${r.tickMinutes} min/tick`, '', `Generated by \`${r.generatedBy}\`. Minutes are from detection. "sim caught" is the calibrated world's truth; "record" is the minute the 1991 command post was told (data/incidents/${r.slug}/timeline.json); the brain columns are the minute each brain first named a space on that floor as burning, open loop, with sensors dying above the flashover temperature. A floor that never burned but was named is a false alarm.`, '');
  lines.push('## Row A · situational awareness: when was each floor known?', '');
  for (const sensors of ['as-built', 'instrumented'] as const) {
    const rows = r.awareness.filter((a) => a.sensors === sensors);
    lines.push(`### ${sensors} sensors`, '', `| floor | sim caught | record (commander told) | ${rows.map((a) => a.brain).join(' | ')} |`, `|---|---|---|${rows.map(() => '---').join('|')}|`);
    for (const f of floors) lines.push(`| ${f} | ${fmtMin(r.truth.firstBurning[f])} | ${fmtMin(r.record.knownAt[f])} | ${rows.map((a) => fmtMin(a.namedAt[f])).join(' | ')} |`);
    lines.push('', `Fire floor named at confidence ≥ 0.9: ${rows.map((a) => `${a.brain} ${fmtMin(a.certainAt)}`).join(' · ')}.`, '');
    lines.push(`| brain | false certainty | wrong dispatch | coverage | estimation error (°C) |`, `|---|---|---|---|---|`);
    for (const a of rows) lines.push(`| ${a.brain} | ${pct(a.falseCertainty)} | ${pct(a.wrongDispatch)} | ${pct(a.ambiguityCoverage)} | ${a.estimationError.toFixed(1)} |`);
    lines.push('');
  }
  lines.push('## Row B · containment counterfactual: the same fire, closed loop', '', 'Dean\'s allocator drives the default drone roster from the staging floor under each belief. The record\'s own outcome is the last row.', '');
  lines.push('| driver | space-minutes burning | floors that burned | last fire (min) | peak spaces burning | drone deaths |', '|---|---|---|---|---|---|');
  for (const c of r.containment) lines.push(`| ${c.driver} | ${c.fireVolumeMinutes} | ${c.floorsBurned.join(', ') || '–'} | ${fmtMin(c.lastFire)} | ${c.peakBurning} | ${c.droneDeaths} |`);
  lines.push(`| **record (1991)** | – | ${r.record.floorsDestroyed.join(', ')} destroyed | ${r.record.durationMinutes} (under control) | – | – |`, '');
  lines.push('Limits: a compartment model calibrated to the report\'s early milestones (docs/10-incident-replay.md); heat transfer is symmetric so the model also spreads down to 21; drones are not hose crews; the commander baseline is a belief schedule from the record, not a model of decision-making.', '');
  return lines.join('\n');
}

const isMain = typeof process !== 'undefined' && process.argv?.[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const arg = (name: string, fallback: string): string => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback; };
  const slug = arg('slug', 'one-meridian-plaza');
  const t0 = performance.now();
  const results = runIncident({ slug, seed: Number(arg('seed', '42')), minutes: Number(arg('minutes', '1118')) });
  const dir = `data/incidents/${slug}`;
  mkdirSync('results', { recursive: true });
  writeFileSync(`${dir}/results.json`, `${JSON.stringify(results, null, 1)}\n`);
  const md = renderIncidentMarkdown(results);
  writeFileSync(`results/incident-${slug}.md`, md);
  console.log(md);
  console.log(`wrote ${dir}/results.json and results/incident-${slug}.md in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
