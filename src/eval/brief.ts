/**
 * src/eval — owned by Dean.
 *
 * The commander's brief (CP4 prompt 3, task C): templated text from a closed-loop trace
 * and its outcome. No API call, byte-deterministic for the same inputs.
 */
import type { TickRecord } from '../loop';
import type { StructurePlan } from '../shared/types';
import type { Outcome } from './outcome';

export const MAX_PLAY_BY_PLAY = 40;

export type BriefSituation = { mode: string; seed: number; onset?: number; k?: number };

const fmtNull = (x: number | null): string => (x === null ? 'never' : `tick ${x}`);
const perClass = (m: Partial<Record<string, string[]>>): string => {
  const entries = Object.entries(m).filter(([, v]) => v && v.length);
  return entries.length ? entries.map(([k, v]) => `${k} ${v!.length} (${v!.join(', ')})`).join('; ') : 'none';
};

export function renderBrief(name: string, trace: TickRecord[], plan: StructurePlan, outcome: Outcome, situation: BriefSituation): string {
  const first = trace[0];
  const last = trace[trace.length - 1];
  const ticks = trace.length;
  const start = plan.ignition.join(', ') || '(none)';
  const lines: string[] = [];
  lines.push(`COMMANDER'S BRIEF: ${name}`);
  lines.push('');
  lines.push('Situation');
  lines.push(`  Structure ${plan.name}: ${plan.spaces.length} spaces on ${new Set(plan.spaces.map((s) => s.level)).size} level(s), ${plan.sensors.length} fixed sensors, resupply at ${plan.resupply.join(', ') || 'none'}.`);
  lines.push(`  Fire started in ${start}. Failure mode: ${situation.mode}${situation.onset !== undefined ? ` from tick ${situation.onset}` : ''}${situation.k !== undefined ? `, k=${situation.k}` : ''}. Seed ${situation.seed}. ${ticks} ticks${first && last ? ` (${first.t}..${last.t})` : ''}.`);
  const roster = first ? first.truth.drones.map((d) => `${d.id} ${d.class}`).join(', ') : 'none';
  lines.push(`  Drones: ${roster}.`);
  lines.push('');
  lines.push('Play by play');
  const shown = outcome.events.slice(0, MAX_PLAY_BY_PLAY);
  for (const e of shown) lines.push(`  t=${String(e.t).padStart(3)}  ${e.text}`);
  if (outcome.events.length > MAX_PLAY_BY_PLAY) lines.push(`  ... ${outcome.events.length - MAX_PLAY_BY_PLAY} more events not shown`);
  if (outcome.events.length === 0) lines.push('  (nothing happened)');
  lines.push('');
  lines.push('Outcome');
  lines.push(`  fireVolume ${outcome.fireVolume} space-ticks, peak ${outcome.peakBurning} burning at once, burned out: ${outcome.spacesBurnedOut.length ? outcome.spacesBurnedOut.join(', ') : 'none'}.`);
  lines.push(`  contained ${fmtNull(outcome.containedAt)}, extinguished ${fmtNull(outcome.extinguishedAt)}.`);
  lines.push(`  drones used: ${perClass(outcome.dronesUsed)}.`);
  lines.push(`  water: ${outcome.tetherTicks} tether-ticks on suppress; retardant spent ${outcome.retardantSpent.toFixed(2)}.`);
  lines.push(`  drone deaths: ${perClass(outcome.droneDeaths)}.`);
  lines.push(`  commands to the wrong place: ${outcome.wrongFloor}; hedges: ${outcome.hedges}.`);
  lines.push('');
  lines.push(closing(outcome));
  return lines.join('\n');
}

/** One sentence chosen by outcome. */
export function closing(o: Outcome): string {
  if (o.extinguishedAt !== null) return `The fire was put out at tick ${o.extinguishedAt} after burning ${o.fireVolume} space-ticks; ${o.spacesBurnedOut.length} space(s) burned out.`;
  if (o.containedAt !== null) return `The fire was contained from tick ${o.containedAt} and still burning at the end; ${o.peakBurning} space(s) at the peak.`;
  return `The fire was not contained: it was still spreading at the end, ${o.peakBurning} space(s) at the peak.`;
}
