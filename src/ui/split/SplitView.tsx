/**
 * Truth | our brain | Kalman, side by side, with a per-tick verdict strip and a chaos
 * mini-panel. All numbers come from the store's traces; nothing here computes belief.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useSim } from '../store';
import type { CorruptionMode } from '../../shared/types';
import { brainSvg, brainVerdictHtml, geometry, stripSvg, truthSvg, truthVerdictHtml } from './svg';
import './split.css';

const MODES: CorruptionMode[] = ['none', 'freeze', 'blind', 'saturate', 'flashover', 'mixed'];
const MODE_LABEL: Record<CorruptionMode, string> = { none: 'none (clean sensors)', freeze: 'freeze (stale value)', blind: 'blind (reads cold)', saturate: 'saturate (pins at max)', flashover: 'flashover (all die)', mixed: 'mixed (everything)' };
const BRAIN_LABEL: Record<string, { title: string; sub: string }> = {
  ours: { title: 'Our brain', sub: 'physics + hypothesis sets' },
  kalman: { title: 'Kalman baseline', sub: 'trusts every reading' },
};

export function SplitView() {
  const s = useSim();
  const data = s.data;
  const g = useMemo(() => (data ? geometry(data) : null), [data]);
  const rec = data?.ticks[s.cursor];

  // playback
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!s.playing || !data) return;
    let last = performance.now();
    const step = (now: number) => {
      if (now - last >= 1000 / s.speed) { last = now; s.stepBy(1); }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, [s.playing, s.speed, data, s]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); s.toggle(); }
      if (e.key === 'ArrowRight') s.stepBy(1);
      if (e.key === 'ArrowLeft') s.stepBy(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  const spaceIds = s.plan.spaces.map((x) => x.id);
  const target = s.corruption.target ?? [];

  return (
    <div className="fx">
      <header>
        <h1>Firefly · truth vs two brains</h1>
        <div className="cfg">plan={s.plan.name} seed={s.seed} ticks={s.ticks} corruption={JSON.stringify(s.corruption)}</div>
      </header>
      <p className="note">
        How to read it: each box is one space. The colored bar on top is temperature (slate cold, amber warm, red hot, pale white-hot).
        The chip at the bottom is what that space’s own sensor reported this tick. In the two brain panels, a solid red border means
        “believed burning” and a dashed amber MAYBE means the brain cannot rule it in or out. Neither brain can see the truth panel.
      </p>

      <div className="controls" role="group" aria-label="scenario">
        <label>fire starts in
          <span className="chips">
            {spaceIds.map((id) => (
              <button key={id} type="button" aria-pressed={s.ignition === id} onClick={() => s.setIgnition(id)}>{id}</button>
            ))}
          </span>
        </label>
        <label htmlFor="mode">failure mode
          <select id="mode" value={s.corruption.mode} onChange={(e) => s.setCorruption({ mode: e.target.value as CorruptionMode })}>
            {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <label>which sensors
          <span className="chips">
            {spaceIds.map((id) => {
              const on = target.includes(id);
              return <button key={id} type="button" aria-pressed={on} onClick={() => s.setCorruption({ target: on ? target.filter((x) => x !== id) : [...target, id] })}>{id}</button>;
            })}
          </span>
        </label>
        <label htmlFor="k">how many break <input id="k" type="number" min={0} max={8} value={s.corruption.k ?? 1} onChange={(e) => s.setCorruption({ k: Number(e.target.value) })} /></label>
        <label htmlFor="onset">break at tick <input id="onset" type="number" min={0} max={200} value={s.corruption.onset ?? 5} onChange={(e) => s.setCorruption({ onset: Number(e.target.value) })} /></label>
        <label htmlFor="seed">seed <input id="seed" type="number" value={s.seed} onChange={(e) => s.setSeed(Number(e.target.value))} /></label>
        <label htmlFor="ticks">ticks <input id="ticks" type="number" min={5} max={400} value={s.ticks} onChange={(e) => s.setTicks(Number(e.target.value))} /></label>
        <button id="run" type="button" className="primary" onClick={s.run}>Run</button>
      </div>
      <p className="note">
        Fire starts in the chosen space. Failure mode is how the sensors break: freeze = keeps reporting its last value with an old timestamp;
        blind = reads room temperature no matter what; saturate = pins at 300° once it gets hotter; flashover = every sensor in a space over 500° dies;
        mixed = all of those. “Which sensors” limits the breakage to those spaces (empty = any). “How many break” is the budget k for freeze and blind.
        “Break at tick” is when it starts.
      </p>

      {s.error && <pre className="err">{s.error}</pre>}

      {data && rec && g && (
        <>
          <div className="controls" role="group" aria-label="playback">
            <button id="play" type="button" onClick={s.toggle}>{s.playing ? 'Pause' : 'Play'}</button>
            <button id="back" type="button" aria-label="Step back" onClick={() => s.stepBy(-1)}>−1</button>
            <button id="fwd" type="button" aria-label="Step forward" onClick={() => s.stepBy(1)}>+1</button>
            <label htmlFor="scrub">tick</label>
            <input id="scrub" type="range" min={0} max={data.ticks.length - 1} value={s.cursor} onChange={(e) => s.setCursor(Number(e.target.value))} />
            <span className="tick">t={rec.t}</span>
            <label htmlFor="speed">speed
              <select id="speed" value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}>
                <option value={2}>2/s</option><option value={4}>4/s</option><option value={8}>8/s</option>
              </select>
            </label>
          </div>

          <div className="panels">
            <section className="panel">
              <h2>Ground truth <span className="sub">what is actually burning</span></h2>
              <div className="conf" style={{ visibility: 'hidden' }}><span>conf</span><div className="bar"><i /></div><span>–</span></div>
              <div dangerouslySetInnerHTML={{ __html: truthSvg(data, g, rec) }} />
              <div className="verdict" dangerouslySetInnerHTML={{ __html: truthVerdictHtml(rec) }} />
            </section>
            {data.brainNames.map((name) => {
              const b = rec.brains[name]!;
              const lbl = BRAIN_LABEL[name] ?? { title: name, sub: '' };
              return (
                <section className="panel" key={name}>
                  <h2>{lbl.title} <span className="sub">{lbl.sub}</span></h2>
                  <div className={'conf ' + (b.confidence >= 0.9 ? 'hi' : b.confidence < 0.6 ? 'lo' : '')}>
                    <span>conf</span><div className="bar"><i style={{ width: `${(b.confidence * 100).toFixed(0)}%` }} /></div><span>{b.confidence.toFixed(2)}</span>
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: brainSvg(data, g, rec, name) }} />
                  <div className="verdict" dangerouslySetInnerHTML={{ __html: brainVerdictHtml(rec, name) }} />
                </section>
              );
            })}
          </div>

          <div className="strip">
            <h3>Every tick, both brains: bar height is confidence, color is whether the burning set matched truth</h3>
            <div
              onClick={(e) => { const i = (e.target as HTMLElement).getAttribute('data-i'); if (i != null) s.setCursor(Number(i)); }}
              dangerouslySetInnerHTML={{ __html: stripSvg(data, s.cursor) }}
            />
            <div className="legend">
              <span className="ok">matched truth</span>
              <span className="unc">wrong or hedging, and said so (confidence under 0.9)</span>
              <span className="wr">wrong at confidence 0.9 or higher: false certainty</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
