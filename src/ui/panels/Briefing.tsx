/**
 * One line under the belief view, revealed with a CSS-only typewriter. Renders nothing
 * when there is nothing to say. The text comes from briefing.ts (pure).
 */
import { useMemo } from 'react';
import { briefingAt, briefingEvents } from '../briefing';
import { useSim } from '../store';

export function Briefing({ brain }: { brain?: string }) {
  const plan = useSim((s) => s.plan);
  const trace = useSim((s) => (brain ? s.traces[brain] : s.trace) ?? null);
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
