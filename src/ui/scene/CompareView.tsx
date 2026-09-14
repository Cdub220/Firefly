/**
 * Truth | belief | diff, three scenes on one camera. The belief column carries the brain
 * name and its confidence; a HEDGING badge lights when the brain sends different drones
 * to different spaces inside one ambiguous group, and those arrows are drawn thick.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSim } from '../store';
import { ScenarioPanel } from '../panels/ScenarioPanel';
import { ChaosPanel } from '../panels/ChaosPanel';
import { Beats } from '../panels/Beats';
import { Briefing } from '../panels/Briefing';
import { ErrorBoundary } from '../ErrorBoundary';
import { Scene } from './Scene';
import { hedgeInfo } from './hedge';
import { defaultMaxLevel, levelsOf } from '../levels';
import '../split/split.css';
import '../panels/panels.css';
import './scene.css';
import './compare.css';

const BRAIN_LABEL: Record<string, string> = { ours: 'Our brain', kalman: 'Kalman baseline' };

export function CompareView() {
  const s = useSim();
  const rec = s.trace?.[s.cursor];
  const prev = s.cursor > 0 ? s.trace?.[s.cursor - 1] : undefined;
  const brains = Object.keys(s.traces);
  const [brain, setBrain] = useState<string>('ours');
  useEffect(() => { if (brains.length && !brains.includes(brain)) setBrain(brains[0]!); }, [brains, brain]);
  const beliefRec = s.traces[brain]?.[s.cursor];
  const belief = beliefRec?.belief;
  const levels = useMemo(() => levelsOf(s.plan), [s.plan]);
  const [maxLevel, setMaxLevel] = useState<number>(() => defaultMaxLevel(s.plan, s.ignition));
  useEffect(() => { setMaxLevel(defaultMaxLevel(s.plan, s.ignition)); }, [s.plan, s.ignition]);
  // Commands are the primary brain's (they drive the world); a hedge is judged against the shown brain's ambiguity.
  const hedge = useMemo(() => (belief && rec ? hedgeInfo(belief, rec.commands) : { hedging: false, drones: [], groups: [] }), [belief, rec]);
  const thick = useMemo(() => new Set(hedge.drones), [hedge]);
  const drones = rec ? { prev, playing: s.playing, speed: s.speed, thick } : undefined;
  const group = 'compare';

  return (
    <div className={'fx compare-view' + (s.demo ? ' demo' : '')}>
      <aside className="compare-left">
        {s.demo ? <section className="panel-box" aria-label="demo script"><h2>Demo script</h2><Beats compact /></section> : <ScenarioPanel />}
        <ChaosPanel />
      </aside>
      <main className="compare-main">
        <div className="controls compare-bar" role="group" aria-label="compare">
          <label htmlFor="cmp-brain">brain
            <select id="cmp-brain" value={brain} onChange={(e) => setBrain(e.target.value)}>
              {brains.map((b) => <option key={b} value={b}>{BRAIN_LABEL[b] ?? b}</option>)}
            </select>
          </label>
          <label htmlFor="cmp-level">show levels ≤
            <input id="cmp-level" type="range" min={levels[0] ?? 1} max={levels[levels.length - 1] ?? 1} value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))} style={{ flex: '0 0 120px', minWidth: 80 }} />
            <span className="tick">{maxLevel}</span>
          </label>
          <span className="tick">{rec ? `t=${rec.t}` : ''}</span>
          {hedge.hedging && (
            <span className="hedge-badge" role="status" aria-live="assertive" title={`Different drones sent to different spaces in ${hedge.groups.map((g) => g.join('|')).join(' ; ')}`}>
              HEDGING · covering {hedge.groups.map((g) => g.join(' or ')).join(', ')}
            </span>
          )}
        </div>
        {s.error && <pre className="err">{s.error}</pre>}
        {!rec && <div className="scene-empty compare-empty">Press Run.</div>}
        {rec && (
          <ErrorBoundary label="3D compare scenes">
          <div className="compare-grid">
            <section className="compare-col">
              <header><h2>Ground truth</h2><span className="sub">what is actually burning</span></header>
              <div className="compare-canvas"><Scene plan={s.plan} rec={rec} view="truth" maxLevel={maxLevel} drones={drones} cameraGroup={group} /></div>
            </section>
            <section className="compare-col">
              <header>
                <h2>{BRAIN_LABEL[brain] ?? brain}</h2>
                {belief && (
                  <span className={'conf ' + (belief.confidence >= 0.9 ? 'hi' : belief.confidence < 0.6 ? 'lo' : '')}>
                    <span>conf</span><span className="bar"><i style={{ width: `${(belief.confidence * 100).toFixed(0)}%` }} /></span><span>{belief.confidence.toFixed(2)}</span>
                  </span>
                )}
                {belief && belief.suspectSensors.length > 0 && <span className="sub">distrusts {belief.suspectSensors.join(', ')}</span>}
              </header>
              <div className="compare-canvas"><Scene plan={s.plan} rec={rec} view="belief" brain={brain} belief={belief} maxLevel={maxLevel} drones={drones} cameraGroup={group} /></div>
              <Briefing brain={brain} />
            </section>
            <details className="compare-col compare-diff" open>
              <summary><h2>Difference</h2><span className="sub">green under 20 °C, amber under 80, red beyond; outline = burning verdict disagrees, amber if inside a maybe-group</span></summary>
              <div className="compare-canvas"><Scene plan={s.plan} rec={rec} view="diff" brain={brain} belief={belief} maxLevel={maxLevel} cameraGroup={group} /></div>
            </details>
          </div>
          </ErrorBoundary>
        )}
        {!s.demo && <p className="note">Belief view: box color is the brain's temperature estimate, pulsing boxes are its burning set, a tinted hull joins spaces it cannot tell apart, a struck red sphere is a sensor it distrusts, a hatched box has no reading at all. Orbit any view; all three move. Thick arrows are a hedge: different drones sent to different spaces inside one maybe-group.</p>}
      </main>
    </div>
  );
}
