/**
 * The 3D page: scenario and chaos panels on the left, the scene in the middle, the debug
 * tables on the right. Reads trace[cursor] from the store; computes nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSim } from '../store';
import { ScenarioPanel } from '../panels/ScenarioPanel';
import { ChaosPanel } from '../panels/ChaosPanel';
import { Scene } from './Scene';
import { truthFrame } from './frame';
import { droneRows } from '../droneLayout';
import '../split/split.css';
import '../panels/panels.css';
import './scene.css';

export function SceneView() {
  const s = useSim();
  const rec = s.trace?.[s.cursor];
  const prev = s.cursor > 0 ? s.trace?.[s.cursor - 1] : undefined;
  const levels = useMemo(() => [...new Set(s.plan.spaces.map((x) => x.level))].sort((a, b) => a - b), [s.plan]);
  const [maxLevel, setMaxLevel] = useState<number>(levels[levels.length - 1] ?? 1);
  useEffect(() => { setMaxLevel(levels[levels.length - 1] ?? 1); }, [levels]);
  const frame = useMemo(() => (rec ? truthFrame(rec, s.plan) : null), [rec, s.plan]);

  const burningNow = rec ? rec.truth.spaces.filter((x) => x.burning).map((x) => x.id) : [];
  const brainNames = s.data?.brainNames ?? [];
  const beliefs = s.data?.ticks[s.cursor]?.brains;

  return (
    <div className="fx scene-view">
      <div className="scene-grid">
        <aside className="scene-left">
          <ScenarioPanel />
          <ChaosPanel />
        </aside>

        <main className="scene-center">
          <div className="controls scene-bar" role="group" aria-label="scene">
            <label htmlFor="scene-level">show levels ≤
              <input id="scene-level" type="range" min={levels[0] ?? 1} max={levels[levels.length - 1] ?? 1} value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))} style={{ flex: '0 0 120px', minWidth: 80 }} />
              <span className="tick">{maxLevel}</span>
            </label>
            <span className="tick">{rec ? `t=${rec.t}` : ''}</span>
            <span className="scene-burning">burning: {burningNow.length ? burningNow.join(', ') : '–'}</span>
          </div>
          {s.error && <pre className="err">{s.error}</pre>}
          <div className="scene-canvas">
            {frame && rec ? <Scene plan={s.plan} frame={frame} maxLevel={maxLevel} drones={{ rec, prev, playing: s.playing, speed: s.speed }} /> : <div className="scene-empty">Press Run.</div>}
          </div>
          <p className="note">Truth only. Box color is temperature (slate → amber → red at 400 °C → white-hot at 600). Pulsing boxes are burning. Lines are heat paths: gray doors and passages, dim bulkheads, blue floors and shafts; a dim red line is a door that has shut. Spheres are fixed sensors as the brain sees them this tick: green reporting, amber lying by more than 30 °C, red silent. Drones ring above their space: cyan cylinder tether (dashed hose to resupply), green retardant, white scout, yellow relay, orange hatch; the bar beneath is resource; a gray X is where one died. Arrows are the brain's commands, coloured by task, faded on arrival.</p>
        </main>

        <aside className="scene-right scene-side">
          <h3>Tables (debug view)</h3>
          {rec ? (
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
              <h3>Drones <span className="sub">truth · what the brain saw · its command</span></h3>
              <table className="drones">
                <thead><tr><th>id</th><th>class</th><th>at</th><th>seen</th><th>goTo</th><th>task</th><th>res</th><th>alive</th></tr></thead>
                <tbody>
                  {droneRows(rec).map((r) => (
                    <tr key={r.id} className={[r.alive ? '' : 'dead', r.stale ? 'stale' : ''].join(' ').trim()} title={r.stale ? 'the brain’s view of this drone differs from truth' : undefined}>
                      <td>{r.id}</td><td>{r.class}</td><td>{r.at}</td><td>{r.seenAt ?? '–'}</td><td>{r.goTo ?? ''}{r.arrived ? ' ✓' : ''}</td><td>{r.task ?? ''}</td><td>{r.resource.toFixed(2)}</td><td>{r.alive ? '●' : '✕'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <p className="note">Run to fill the tables.</p>}
        </aside>
      </div>
    </div>
  );
}
