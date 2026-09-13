/**
 * The briefing line under the belief view. Pure.
 *
 * The contract has no per-step briefing string yet (Belief carries none), so: if a
 * record's belief has a `briefing` string, that wins; otherwise the line is the latest
 * brain-side event Dean's outcome model (src/eval/outcome.ts, allowed import) reports at
 * or before the cursor tick: a sensor marked suspect, a dispatch, a hedge. Events the
 * model derives from truth (ignitions, burn-outs, containment) are not a brain's
 * briefing and are left out. Nothing to say means an empty string, and the panel renders
 * nothing.
 */
import { computeOutcome, type OutcomeEvent, type OutcomeEventKind } from '../eval/outcome';
import type { TickRecord } from '../loop';
import type { StructurePlan } from '../shared/types';

/** Event kinds a brain could know about from its own belief and commands. */
export const BRIEFING_KINDS: ReadonlySet<OutcomeEventKind> = new Set<OutcomeEventKind>(['sensor-suspect', 'dispatch', 'hedge']);

/** Brain-side outcome events for a trace, tick-ordered. Memoize per trace at the call site. */
export function briefingEvents(trace: readonly TickRecord[], plan: StructurePlan): OutcomeEvent[] {
  if (trace.length === 0) return [];
  return computeOutcome([...trace], plan).events.filter((e) => BRIEFING_KINDS.has(e.kind));
}

/** A belief's own briefing, if the brain supplied one. */
export function beliefBriefing(rec: Pick<TickRecord, 'belief'> | undefined): string {
  const b = (rec?.belief as { briefing?: unknown } | undefined)?.briefing;
  return typeof b === 'string' ? b.trim() : '';
}

/** The line to show at `cursor`: the brain's own briefing, else the latest event so far. */
export function briefingAt(rec: TickRecord | undefined, events: readonly OutcomeEvent[]): string {
  if (!rec) return '';
  const own = beliefBriefing(rec);
  if (own) return own;
  let latest: OutcomeEvent | undefined;
  for (const e of events) {
    if (e.t > rec.t) break;
    latest = e;
  }
  return latest ? `t=${latest.t} · ${latest.text}` : '';
}
