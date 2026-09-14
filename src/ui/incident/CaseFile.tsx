/**
 * Case file: a documented real fire replayed through the simulation. Top: the incident
 * record's timeline in minutes with the sim cursor. Middle: which floors were burning in
 * the calibrated world and when each belief (ours, Kalman, the 1991 commander) first
 * named them; the record's "commander was told" minute beside them. Bottom: the
 * containment counterfactual from `npm run incident` and the stated limits.
 *
 * Everything on screen is either the incident record (data/incidents/<slug>/), the live
 * traces in the store, or the committed results.json. No network.
 */
import { useMemo } from 'react';
import { useSim, CASEFILE } from '../store';
import { Beats } from '../panels/Beats';
import { ScenarioPanel } from '../panels/ScenarioPanel';
import { certainAt, firstBurningByFloor, firstNamedByFloor, floorsBurningByTick, knownAtFromStages } from '../../incident/floors';
import type { KnowledgeStage } from '../../incident/commander';
import timeline from '../../../data/incidents/one-meridian-plaza/timeline.json';
import results from '../../../data/incidents/one-meridian-plaza/results.json';
import '../split/split.css';
import '../panels/panels.css';
import './casefile.css';

const BRAINS: Array<{ key: string; label: string; color: string }> = [
  { key: 'ours', label: 'Our brain', color: '#5dd39e' },
  { key: 'kalman', label: 'Kalman baseline', color: '#ff5c5c' },
  { key: 'commander', label: '1991 commander (record)', color: '#f0b429' },
];
const KIND_GLYPH: Record<string, string> = { detection: '◉', '911': '☎', arrival: '▲', alarm: '!', spread: '🔥', casualty: '✝', water: '≈', withdrawal: '⇦', control: '■', systems: '⚡', operations: '·', 'commander-knows': '◇', 'building-staff': '·' };
const fmt = (m: number | null | undefined): string => (m === null || m === undefined ? 'never' : `${m}`);

export function CaseFile() {
  const s = useSim();
  const tickMinutes = CASEFILE.tickMinutes;
  const onCase = s.planName === CASEFILE.plan;
  const trace = onCase ? s.trace : null;
  const minute = trace ? (s.cursor + 1) * tickMinutes : 0;
  const total = timeline.outcome.durationMinutes;
  const events = timeline.events as Array<{ minute: number; kind: string; text: string; floors?: number[] }>;
  const knownAt = useMemo(() => knownAtFromStages(timeline.commanderKnowledge as KnowledgeStage[]), []);
  const truthFirst = useMemo(() => (trace ? firstBurningByFloor(trace, tickMinutes) : {}), [trace, tickMinutes]);
  const named = useMemo(() => Object.fromEntries(BRAINS.map((b) => [b.key, onCase && s.traces[b.key] ? firstNamedByFloor(s.traces[b.key]!, tickMinutes) : {}])), [s.traces, onCase, tickMinutes]);
  const certain = useMemo(() => Object.fromEntries(BRAINS.map((b) => [b.key, onCase && s.traces[b.key] ? certainAt(s.traces[b.key]!, tickMinutes, 22) : null])), [s.traces, onCase, tickMinutes]);
  const burningFloors = useMemo(() => (trace ? floorsBurningByTick(trace) : []), [trace]);
  const floors = useMemo(() => [...new Set(s.plan.spaces.map((x) => x.level))].sort((a, b) => b - a), [s.plan]);
  const rec = trace?.[s.cursor];
  const beliefs = rec ? BRAINS.map((b) => ({ ...b, r: s.traces[b.key]?.[s.cursor] })) : [];
  const nowFloors = burningFloors[s.cursor] ?? [];
  const W = 900; const H = 70; const x = (m: number) => 40 + (m / total) * (W - 60);

  return (
    <div className={'fx casefile' + (s.demo ? ' demo' : '')}>
      <aside className="casefile-left">
        {s.demo ? <section className="panel-box" aria-label="demo script"><h2>Demo script</h2><Beats compact /></section> : <ScenarioPanel />}
        <section className="panel-box">
          <h2>The record</h2>
          <p className="sub">{timeline.name}. {timeline.place}, {timeline.date}. Minutes are from the first smoke detector. Source: {timeline.source}.</p>
          <button type="button" className="primary wide" onClick={() => s.runBeat('casefile')}>Replay the fire ({CASEFILE_LABEL(tickMinutes)})</button>
        </section>
      </aside>
      <main className="casefile-main">
        {!onCase && <div className="scene-empty">Press <strong>Replay the fire</strong> (key 7) to load the calibrated building and run the incident.</div>}
        {onCase && rec && (
          <>
            <section className="casefile-strip">
              <header><h2>Timeline</h2><span className="sub">the record's events; the white line is the simulation at minute {minute} of {total}</span></header>
              <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label="incident timeline">
                <line x1={x(0)} x2={x(total)} y1={H - 20} y2={H - 20} stroke="#2a3240" />
                {[0, 120, 240, 352, 480, 637, 800, 1000, 1118].map((m) => <text key={m} x={x(m)} y={H} fontSize={9} textAnchor="middle" fill="#6f7b8c">{m}</text>)}
                {events.map((e, i) => (
                  <g key={i} transform={`translate(${x(e.minute)}, ${H - 20})`}>
                    <line y1={-6} y2={6} stroke={e.kind === 'spread' ? '#ff8a5c' : e.kind === 'casualty' ? '#ff5c5c' : '#aab4c3'} />
                    <text y={-10 - (i % 3) * 11} fontSize={9} textAnchor="middle" fill={e.kind === 'spread' ? '#ff8a5c' : '#aab4c3'}><title>{`${e.minute} min · ${e.text}`}</title>{KIND_GLYPH[e.kind] ?? '·'}{e.floors ? ` ${e.floors.join(',')}` : ''}</text>
                  </g>
                ))}
                <line x1={x(minute)} x2={x(minute)} y1={4} y2={H - 8} stroke="#e6eaf0" strokeWidth={1.5} />
              </svg>
              <div className="casefile-now">
                <span>sim, now: floors burning <strong>{nowFloors.length ? nowFloors.join(', ') : '–'}</strong></span>
                {beliefs.map((b) => <span key={b.key} style={{ color: b.color }}>{b.label}: {b.r ? `${[...new Set(b.r.belief.burningSet.map((id) => id.slice(1, 3)))].sort().join(', ') || '–'} · conf ${b.r.belief.confidence.toFixed(2)}` : 'not run'}</span>)}
              </div>
            </section>
            <section className="casefile-table">
              <header><h2>When was each floor known?</h2><span className="sub">minutes from detection · "sim caught" is the calibrated world's truth · "record" is when the command post was told · brains: first minute the belief named a space on the floor</span></header>
              <table className="scorecard">
                <thead><tr><th>floor</th><th>sim caught</th><th>record</th>{BRAINS.map((b) => <th key={b.key} style={{ color: b.color }}>{b.label}</th>)}</tr></thead>
                <tbody>
                  {floors.filter((f) => truthFirst[f] !== undefined || knownAt[f] !== undefined).map((f) => (
                    <tr key={f} className={nowFloors.includes(f) ? 'burn' : ''}>
                      <th scope="row">{f}{f === 22 ? ' (origin)' : ''}</th><td>{fmt(truthFirst[f])}</td><td>{fmt(knownAt[f])}</td>
                      {BRAINS.map((b) => { const v = named[b.key]?.[f]; const seen = v !== undefined && v <= minute; return <td key={b.key} className={seen && truthFirst[f] !== undefined && v <= truthFirst[f]! + tickMinutes ? 'win' : ''}>{seen ? v : v === undefined ? 'never' : '…'}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sub">Fire floor named at confidence ≥ 0.9: {BRAINS.map((b) => `${b.label} ${fmt(certain[b.key])}`).join(' · ')}.</p>
            </section>
            <section className="casefile-table">
              <header><h2>If that belief had driven the drones</h2><span className="sub">closed loop, seed {results.seed}, from <code>npm run incident</code>; the record's outcome last</span></header>
              <table className="scorecard">
                <thead><tr><th>driver</th><th>space-minutes burning</th><th>floors that burned</th><th>last fire (min)</th><th>drone deaths</th></tr></thead>
                <tbody>
                  {results.containment.map((c) => <tr key={c.driver}><th scope="row">{c.driver}</th><td>{c.fireVolumeMinutes}</td><td>{c.floorsBurned.join(', ') || '–'}</td><td>{fmt(c.lastFire)}</td><td>{c.droneDeaths}</td></tr>)}
                  <tr><th scope="row">record (1991)</th><td>–</td><td>{results.record.floorsDestroyed.join(', ')} destroyed</td><td>{results.record.durationMinutes} (under control)</td><td>–</td></tr>
                </tbody>
              </table>
              <p className="sub casefile-limits">Limits, stated before anyone asks: a compartment model calibrated to the report's early milestones, not a fire model; heat transfer is symmetric, so the world also spreads down to 21; drones are not hose crews; the commander is a belief schedule from the record, not a decision model; one seed.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

const CASEFILE_LABEL = (tickMinutes: number): string => `${CASEFILE.minutes} min, ${tickMinutes} min/tick`;
