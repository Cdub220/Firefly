/**
 * The commander's transcript, live: every decision the brain made up to the current tick,
 * with its reason, newest at the bottom, the current tick highlighted. One per world.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { TickRecord } from '../../loop';
import type { StructurePlan } from '../../shared/types';
import { narrateTrace } from '../../eval/narrate';

export function DecisionLog({ title, trace, plan, cursor }: { title: string; trace: TickRecord[] | undefined; plan: StructurePlan; cursor: number }) {
  const lines = useMemo(() => (trace ? narrateTrace(trace, plan) : []), [trace, plan]);
  const t = trace?.[cursor]?.t ?? -1;
  const shown = lines.filter((l) => l.t <= t);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [shown.length]);
  return (
    <section className="h2h-log" aria-label={`${title} decision log`}>
      <header><h2>{title}</h2><span className="sub">{trace ? `${shown.length} decisions through t=${t}` : 'not run'}</span></header>
      <div className="log-body">
        {shown.length === 0 && trace && <div className="log-line muted">no decisions yet</div>}
        {shown.map((l, i) => (
          <div key={i} className={`log-line ${l.kind}${l.t === t ? ' now' : ''}`}>
            <span className="log-t">t={l.t}</span><span className="log-text">{l.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
