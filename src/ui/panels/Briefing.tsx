/**
 * One line under the belief view, revealed with a CSS-only typewriter. Renders nothing
 * when there is nothing to say. The text comes from briefing.ts (pure).
 */
import { useMemo } from 'react';
import { briefingAt, briefingEvents } from '../briefing';
import { useSim } from '../store';

/**
 * `brain` picks the trace from the main run; `trace` overrides it (the head to head
 * hands the Kalman column its own driven world, where its dispatches were real).
 */
export function Briefing({ brain, trace: override }: { brain?: string; trace?: readonly import('../../loop').TickRecord[] | null | undefined }) {
  const plan = useSim((s) => s.plan);
  const own = useSim((s) => (brain ? s.traces[brain] : s.trace) ?? null);
  const trace = override === undefined ? own : override;
  const cursor = useSim((s) => s.cursor);
  const events = useMemo(() => (trace ? briefingEvents(trace, plan) : []), [trace, plan]);
  const text = briefingAt(trace?.[cursor], events);
  if (!text) return null;
  // Keying on the text restarts the reveal whenever the line changes.
  return (
    <p className="briefing" aria-live="polite" key={text}>
      <span className="typewriter" style={{ ['--chars' as string]: text.length }}>{text}</span>
    </p>
  );
}
