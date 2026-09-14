/**
 * Head to head: Kalman on the left, ours on the right, same truth, same broken sensors.
 * A small truth scene above, one shared camera, a containment counter, a scorecard, and a
 * WRONG FLOOR flash on any space a brain names as burning that is not.
 */
import { useEffect, useMemo, useState } from 'react';
import type { TickRecord } from '../../loop';
import { useSim } from '../store';
import { ScenarioPanel } from '../panels/ScenarioPanel';
import { ChaosPanel } from '../panels/ChaosPanel';
import { Scene } from '../scene/Scene';
import { ContainmentChart } from './ContainmentChart';
import { Scorecard } from './Scorecard';
import { DecisionLog } from './DecisionLog';
import { missedSpaces, onsetOf, wrongDispatchSpaces } from './metrics';
import '../split/split.css';
import '../panels/panels.css';
import '../scene/scene.css';
import './h2h.css';

const LEFT = 'kalman';
const RIGHT = 'ours';
const LABEL: Record<string, string> = { kalman: 'Kalman baseline', ours: 'Our brain' };

export function HeadToHead() {
  const s = useSim();
  const rec = s.trace?.[s.cursor];
  const prev = s.cursor > 0 ? s.trace?.[s.cursor - 1] : undefined;
  const left = s.traces[LEFT]?.[s.cursor];
  const right = s.traces[RIGHT]?.[s.cursor];
  const levels = useMemo(() => [...new Set(s.plan.spaces.map((x) => x.level))].sort((a, b) => a - b), [s.plan]);
  const [maxLevel, setMaxLevel] = useState<number>(levels[levels.length - 1] ?? 1);
  useEffect(() => { setMaxLevel(levels[levels.length - 1] ?? 1); }, [levels]);

  // Wrong dispatch: Kalman never hedges, so every miss counts. Ours is spared inside a
  // maybe-group, and if it still trips, it shows.
  const leftRec = s.compare ? s.compare[LEFT]?.[s.cursor] : rec;
  const rightRec = s.compare ? s.compare[RIGHT]?.[s.cursor] : rec;
  const leftBelief = s.compare ? s.compare[LEFT]?.[s.cursor]?.belief : left?.belief;
  const rightBelief = s.compare ? s.compare[RIGHT]?.[s.cursor]?.belief : right?.belief;
  const wrongLeft = useMemo(() => (leftRec && leftBelief ? new Set(wrongDispatchSpaces(leftRec, leftBelief, false)) : new Set<string>()), [leftRec, leftBelief]);
  const wrongRight = useMemo(() => (rightRec && rightBelief ? new Set(wrongDispatchSpaces(rightRec, rightBelief, true)) : new Set<string>()), [rightRec, rightBelief]);
  // The other failure: a fire the brain does not know about. Shown as a tag, not a flash;
  // in the belief scene the space simply stays dark.
  const missedLeft = useMemo(() => (leftRec && leftBelief ? missedSpaces(leftRec, leftBelief) : []), [leftRec, leftBelief]);
  const missedRight = useMemo(() => (rightRec && rightBelief ? missedSpaces(rightRec, rightBelief) : []), [rightRec, rightBelief]);
  const runs = s.compare ?? (s.trace ? { [RIGHT]: s.trace } : {});
  // Each column shows its own world when a head-to-head run exists (the brain drove those
  // drones and that fire); otherwise both columns fall back to the shared ours-driven world.
  const worldRec = (name: string): TickRecord | undefined => (s.compare ? s.compare[name]?.[s.cursor] : rec);
  const worldPrev = (name: string): TickRecord | undefined => (s.compare ? (s.cursor > 0 ? s.compare[name]?.[s.cursor - 1] : undefined) : prev);
  // Showdown is on when the corruption on screen is exactly what the button sets.
  const showdownOn = s.corruption.mode === 'blind' && (s.corruption.onset ?? 5) === 1 && (s.corruption.k ?? 2) === 1
    && (s.corruption.target?.length === 1 && s.corruption.target[0] === s.ignition);
  const onset = s.trace ? (onsetOf(s.trace) > 0 ? onsetOf(s.trace) : null) : null;
  const group = 'h2h';
  const missing = !s.traces[LEFT];

  return (
    <div className="fx h2h-view">
      <aside className="h2h-left">
        <ScenarioPanel />
        <ChaosPanel />
      </aside>
      <main className="h2h-main">
        <div className="controls h2h-bar" role="group" aria-label="head to head">
          <button type="button" className="primary" onClick={s.runCompare} title="Run once with each brain driving the world, same seed and settings">Run head to head</button>
          <button type="button" id="h2h-showdown" className={showdownOn ? 'on' : ''} aria-pressed={showdownOn} onClick={s.runShowdown} title="Blind the ignition sensor from the first tick, then run head to head. A later onset lets both brains lock on before the sensor dies, and both worlds contain.">Showdown: blind from t=1</button>
          <label htmlFor="h2h-level">show levels ≤
            <input id="h2h-level" type="range" min={levels[0] ?? 1} max={levels[levels.length - 1] ?? 1} value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))} style={{ flex: '0 0 120px', minWidth: 80 }} />
            <span className="tick">{maxLevel}</span>
          </label>
          <span className="tick">{rec ? `t=${rec.t}` : ''}</span>
          {missing && s.trace && <span className="sub">Kalman did not run: set brains to both, or press Run head to head.</span>}
        </div>
        {s.error && <pre className="err">{s.error}</pre>}
        {!rec && <div className="scene-empty h2h-empty">Press Run head to head.</div>}
        {rec && (
          <>
            <section className="h2h-truth">
              <header><h2>Ground truth</h2><span className="sub">same fire, same broken sensors, for both brains</span>{showdownOn && <span className="showdown-tag">SHOWDOWN ON · sensor in {s.ignition} blind from t=1</span>}</header>
              <div className="h2h-canvas small"><Scene plan={s.plan} rec={rec} view="truth" maxLevel={maxLevel} drones={{ prev, playing: s.playing, speed: s.speed }} cameraGroup={group} /></div>
            </section>
            <div className="h2h-grid">
              {[[LEFT, s.compare ? s.compare[LEFT]?.[s.cursor] : left, wrongLeft, missedLeft] as const, [RIGHT, s.compare ? s.compare[RIGHT]?.[s.cursor] : right, wrongRight, missedRight] as const].map(([name, r, wrong, missed]) => (
                <section className={`h2h-col ${name}`} key={name}>
                  <header>
                    <h2>{LABEL[name] ?? name}</h2>
                    <span className="sub">{s.compare ? 'its own world: this brain commands these drones' : 'belief on the ours-driven world'}</span>
                    {r ? (
                      <>
                        <span className={'conf ' + (r.belief.confidence >= 0.9 ? 'hi' : r.belief.confidence < 0.6 ? 'lo' : '')}>
                          <span>conf</span><span className="bar"><i style={{ width: `${(r.belief.confidence * 100).toFixed(0)}%` }} /></span><span>{r.belief.confidence.toFixed(2)}</span>
                        </span>
                        <span className="sub burning-count" data-brain={name}>burning set: <strong>{r.belief.burningSet.length}</strong>{r.belief.ambiguous.length > 0 ? ` · maybe ${r.belief.ambiguous.flat().length}` : ''}</span>
                        {wrong.size > 0 && <span className="wrong-floor-tag" data-brain={name}>WRONG FLOOR · {[...wrong].join(', ')}</span>}
                        {missed.length > 0 && <span className="missed-tag" data-brain={name} title="Burning in truth, and this brain neither names it nor lists it as a maybe">MISSED · {missed.join(', ')}</span>}
                      </>
                    ) : <span className="sub">not run</span>}
                  </header>
                  <div className="h2h-canvas">
                    {r && worldRec(name) ? <Scene plan={s.plan} rec={worldRec(name)!} view="belief" brain={name} belief={r.belief} maxLevel={maxLevel} cameraGroup={group} wrongFloor={wrong} drones={{ prev: worldPrev(name), playing: s.playing, speed: s.speed }} /> : <div className="scene-empty">no trace for {name}</div>}
                  </div>
                </section>
              ))}
            </div>
            <div className="h2h-bottom">
              <section className="h2h-chart">
                <header><h2>Containment</h2><span className="sub">spaces burning in truth over time; {s.compare ? 'each curve is the world with that brain in command' : s.closedLoop ? 'the world with ours in command · press Run head to head for the Kalman curve' : 'an open-loop world, nobody in command · press Run head to head'}</span></header>
                <ContainmentChart runs={runs} cursor={s.cursor} onset={onset} spaces={s.plan.spaces.length} labels={s.compare ? undefined : { [RIGHT]: s.closedLoop ? 'ours driving' : 'open loop · nobody driving' }} />
              </section>
              <section className="h2h-score">
                <header><h2>Scorecard</h2><span className="sub">both beliefs scored on {s.closedLoop ? 'the ours-driven world' : 'the same open-loop world'}, from corruption onset; better in bold</span></header>
                <Scorecard traces={s.traces} left={LEFT} right={RIGHT} />
              </section>
            </div>
            <div className="h2h-logs">
              {s.compare && <DecisionLog title="Kalman baseline · decisions" trace={s.compare[LEFT]} plan={s.plan} cursor={s.cursor} />}
              <DecisionLog title="Our brain · decisions" trace={s.compare ? s.compare[RIGHT] : s.trace ?? undefined} plan={s.plan} cursor={s.cursor} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
