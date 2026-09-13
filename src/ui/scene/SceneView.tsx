/**
 * The 3D truth view: scene filling the viewport, playback controls, level slicer, and the
 * truth/belief tables in a collapsible side panel (the debug view). Reads trace[cursor]
 * from the store; computes nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSim } from '../store';
import { Scene } from './Scene';
import { truthFrame } from './frame';
import '../split/split.css';
import './scene.css';

export function SceneView() {
  const s = useSim();
  const rec = s.trace?.[s.cursor];
  const levels = useMemo(() => [...new Set(s.plan.spaces.map((x) => x.level))].sort((a, b) => a - b), [s.plan]);
  const [maxLevel, setMaxLevel] = useState<number>(levels[levels.length - 1] ?? 1);
  useEffect(() => { setMaxLevel(levels[levels.length - 1] ?? 1); }, [levels]);
  const frame = useMemo(() => (rec ? truthFrame(rec, s.plan) : null), [rec, s.plan]);

  // Playback runs in App via usePlayback(); this view only reads the cursor.
  const burningNow = rec ? rec.truth.spaces.filter((x) => x.burning).map((x) => x.id) : [];
  const brainNames = s.data?.brainNames ?? [];
  const beliefs = s.data?.ticks[s.cursor]?.brains;

  return (
    <div className="fx scene-view">
      <div className="controls" role="group" aria-label="scene playback">
        <label htmlFor="scene-seed">seed <input id="scene-seed" type="number" value={s.seed} onChange={(e) => s.setSeed(Number(e.target.value))} /></label>
        <label htmlFor="scene-ticks">ticks <input id="scene-ticks" type="number" min={5} max={400} value={s.ticks} onChange={(e) => s.setTicks(Number(e.target.value))} /></label>
        <button id="scene-run" type="button" className="primary" onClick={s.run}>Run</button>
        <button id="scene-play" type="button" onClick={s.toggle} disabled={!s.trace}>{s.playing ? 'Pause' : 'Play'}</button>
        <button type="button" aria-label="Step back" onClick={() => s.stepBy(-1)} disabled={!s.trace}>−1</button>
        <button type="button" aria-label="Step forward" onClick={() => s.tick()} disabled={!s.trace}>+1</button>
        <label htmlFor="scene-scrub">tick</label>
        <input id="scene-scrub" type="range" min={0} max={Math.max(0, (s.trace?.length ?? 1) - 1)} value={s.cursor} onChange={(e) => s.setCursor(Number(e.target.value))} disabled={!s.trace} />
        <span className="tick">t={rec?.t ?? '–'}</span>
        <label htmlFor="scene-level">show levels ≤
          <input id="scene-level" type="range" min={levels[0] ?? 1} max={levels[levels.length - 1] ?? 1} value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))} style={{ flex: '0 0 120px', minWidth: 80 }} />
          <span className="tick">{maxLevel}</span>
        </label>
        <span className="scene-burning">burning: {burningNow.length ? burningNow.join(', ') : '–'}</span>
      </div>

      {s.error && <pre className="err">{s.error}</pre>}

      <p className="note">Truth only. Box color is temperature (slate → amber → red at 400 °C → white-hot at 600). Pulsing boxes are burning. Lines are heat paths: gray doors and passages, dim bulkheads, blue floors and shafts; a dim red line is a door that has shut. Spheres are fixed sensors as the brain sees them this tick: green reporting, amber lying by more than 30 °C, red silent.</p>

      <div className="scene-body">
        <div className="scene-canvas">
          {frame ? <Scene plan={s.plan} frame={frame} maxLevel={maxLevel} /> : <div className="scene-empty">Press Run.</div>}
        </div>
        <details className="scene-side">
          <summary>Tables (debug view)</summary>
          {rec && (
            <>
              <h3>Truth · t={rec.t}</h3>
              <table>
                <thead><tr><th>space</th><th>lvl</th><th>temp</th><th>burn</th><th>fuel</th></tr></thead>
                <tbody>
                  {rec.truth.spaces.map((x) => (
                    <tr key={x.id} className={x.burning ? 'burn' : ''}><td>{x.id}</td><td>{x.level}</td><td>{x.temp.toFixed(0)}</td><td>{x.burning ? '●' : ''}</td><td>{x.fuel.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
              {beliefs && brainNames.map((name) => {
                const b = beliefs[name]!;
                const maybe = new Set(b.ambiguous.flat());
                return (
                  <div key={name}>
                    <h3>{name} · conf {b.confidence.toFixed(2)}{b.suspectSensors.length ? ` · suspect ${b.suspectSensors.join(',')}` : ''}</h3>
                    <table>
                      <thead><tr><th>space</th><th>est</th><th>burn</th><th>maybe</th></tr></thead>
                      <tbody>
                        {s.plan.spaces.map((x) => (
                          <tr key={x.id} className={b.burningSet.includes(x.id) ? 'burn' : ''}>
                            <td>{x.id}</td><td>{(b.estimate[x.id] ?? 0).toFixed(0)}</td><td>{b.burningSet.includes(x.id) ? '●' : ''}</td><td>{maybe.has(x.id) ? '?' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              <h3>Drones</h3>
              <table>
                <thead><tr><th>id</th><th>class</th><th>at</th><th>res</th><th>alive</th></tr></thead>
                <tbody>
                  {rec.truth.drones.map((d) => (
                    <tr key={d.id} className={d.alive ? '' : 'dead'}><td>{d.id}</td><td>{d.class}</td><td>{d.at}</td><td>{d.resource.toFixed(2)}</td><td>{d.alive ? '●' : '✕'}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </details>
      </div>
    </div>
  );
}
