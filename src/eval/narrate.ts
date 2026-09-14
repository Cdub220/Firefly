/**
 * src/eval — owned by Dean.
 *
 * The commander's transcript: one plain sentence per decision, with the reason, derived
 * from the belief and the commands on each tick. Pure; nothing here reads truth, so a line
 * says what the brain believed and did, never whether it was right (the containment chart
 * and the scorecard say that). Rendered live by the head-to-head view and usable by the
 * brief.
 */
import type { TickRecord } from '../loop';
import type { Belief, Command, Drone, SpaceId, StructurePlan } from '../shared/types';

export type NarrationKind = 'belief' | 'maybe' | 'suspect' | 'dispatch' | 'refill' | 'blackout';
export type NarrationLine = { t: number; kind: NarrationKind; text: string };

const pct = (p: number | undefined): string => (p === undefined ? '?' : `${Math.round(p * 100)}%`);
const sameSet = (a: readonly string[], b: readonly string[]): boolean => [...a].sort().join(',') === [...b].sort().join(',');
const list = (ids: readonly string[]): string => (ids.length <= 3 ? ids.join(', ') : `${ids.slice(0, 3).join(', ')} and ${ids.length - 3} more`);

/** What the brain believes this tick, said only when it changed from last tick. */
function beliefLines(t: number, b: Belief, prev: Belief | undefined, trusted: number): NarrationLine[] {
  const out: NarrationLine[] = [];
  if (trusted === 0 && b.confidence <= 0.05 && b.burningSet.length > 0) {
    if (!prev || prev.confidence > 0.05) out.push({ t, kind: 'blackout', text: `No sensor can be trusted. Holding last known fire in ${list(b.burningSet)} as unconfirmed.` });
    return out;
  }
  if (!prev || !sameSet(prev.burningSet, b.burningSet)) {
    if (b.burningSet.length === 0) out.push({ t, kind: 'belief', text: prev && prev.burningSet.length > 0 ? `No space believed burning any more (confidence ${b.confidence.toFixed(2)}).` : `No fire detected yet (confidence ${b.confidence.toFixed(2)}).` });
    else out.push({ t, kind: 'belief', text: `Believes ${list(b.burningSet)} burning (${b.burningSet.map((id) => `${id} ${pct(b.probability?.[id])}`).join(', ')}; confidence ${b.confidence.toFixed(2)}).` });
  }
  const maybe = b.ambiguous.flat();
  const prevMaybe = prev?.ambiguous.flat() ?? [];
  if (maybe.length > 0 && !sameSet(maybe, prevMaybe)) {
    out.push({ t, kind: 'maybe', text: `Cannot tell whether ${list(maybe)} ${maybe.length === 1 ? 'is' : 'are'} burning or just hot (${maybe.map((id) => `${id} ${pct(b.probability?.[id])}`).join(', ')}).` });
  }
  const newSuspects = b.suspectSensors.filter((s) => !(prev?.suspectSensors ?? []).includes(s));
  if (newSuspects.length > 0) out.push({ t, kind: 'suspect', text: `Distrusts sensor${newSuspects.length > 1 ? 's' : ''} ${list(newSuspects)}: the reading contradicts the physics of the building.` });
  return out;
}

const CLASS_WORD: Record<string, string> = { tether: 'water tether', retardant: 'retardant drone', scout: 'scout', relay: 'relay drone', hatch: 'hatch drone' };
const plural = (n: number, w: string): string => (n === 1 ? `1 ${w}` : `${n} ${w}s`);

/** Why a command was issued, from the belief alone. */
function reasonFor(task: string, goTo: SpaceId, b: Belief, cls: string): string {
  const p = b.probability?.[goTo];
  const inSet = b.burningSet.includes(goTo);
  const inMaybe = b.ambiguous.flat().includes(goTo);
  switch (task) {
    case 'suppress': return inSet ? `${goTo} on fire (${pct(p)})` : inMaybe ? `${goTo} may be burning (${pct(p)})` : `${goTo} is the hottest threat (${pct(p)})`;
    case 'observe': return inMaybe ? `unsure whether ${goTo} is burning or just hot (${pct(p)}), need a reading there` : inSet ? `eyes on the fire in ${goTo}` : `no trusted reading from ${goTo}`;
    case 'coat': return `${goTo} is next to the fire and unburned: strip its fuel before it catches`;
    case 'close-door': return `close doors at ${goTo} to slow the spread`;
    case 'refill': return `${cls === 'retardant' ? 'out of retardant' : 'low on resource'}, back to resupply at ${goTo}`;
    default: return task;
  }
}

/** Dispatch lines, one per (target, task), grouping drones sent together; only NEW orders. */
function dispatchLines(t: number, cmds: readonly Command[], prevCmds: readonly Command[] | undefined, b: Belief, drones: readonly Drone[]): NarrationLine[] {
  const byDrone = new Map(drones.map((d) => [d.id, d]));
  const prevBy = new Map((prevCmds ?? []).map((c) => [c.droneId, c]));
  const groups = new Map<string, { task: string; goTo: SpaceId; cls: string; ids: string[] }>();
  for (const c of cmds) {
    if (c.task === 'hold') continue;
    const p = prevBy.get(c.droneId);
    if (p && p.goTo === c.goTo && p.task === c.task) continue; // standing order, already narrated
    const cls = byDrone.get(c.droneId)?.class ?? 'drone';
    const key = `${c.goTo}|${c.task}|${cls}`;
    (groups.get(key) ?? groups.set(key, { task: c.task, goTo: c.goTo, cls, ids: [] }).get(key)!).ids.push(c.droneId);
  }
  return [...groups.values()].map((g) => {
    const who = `${plural(g.ids.length, CLASS_WORD[g.cls] ?? g.cls)} (${g.ids.join(', ')})`;
    const verb = g.task === 'suppress' ? 'to cool it' : g.task === 'observe' ? 'to look' : g.task === 'coat' ? 'to coat it' : g.task === 'close-door' ? 'to seal it' : '';
    const text = g.task === 'refill'
      ? `${who} ${reasonFor(g.task, g.goTo, b, g.cls)}.`
      : `${reasonFor(g.task, g.goTo, b, g.cls)}: sending ${who} to ${g.goTo}${verb ? ' ' + verb : ''}.`;
    return { t, kind: g.task === 'refill' ? 'refill' as const : 'dispatch' as const, text: text.charAt(0).toUpperCase() + text.slice(1) };
  });
}

/** Lines for one tick given the previous record (undefined on the first tick). */
export function narrateTick(rec: TickRecord, prev: TickRecord | undefined, _plan: StructurePlan): NarrationLine[] {
  const trusted = rec.obs.readings.filter((r) => !rec.belief.suspectSensors.includes(r.sensorId)).length;
  return [
    ...beliefLines(rec.t, rec.belief, prev?.belief, trusted),
    ...dispatchLines(rec.t, rec.commands, prev?.commands, rec.belief, rec.obs.drones),
  ];
}

/** The whole transcript for a trace. */
export function narrateTrace(trace: readonly TickRecord[], plan: StructurePlan): NarrationLine[] {
  const out: NarrationLine[] = [];
  for (let i = 0; i < trace.length; i++) out.push(...narrateTick(trace[i]!, trace[i - 1], plan));
  return out;
}
