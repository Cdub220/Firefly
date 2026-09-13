/**
 * Scenario picker: structure, seed, ticks, brains, run, playback. Everything goes through
 * the store; nothing here computes physics or belief.
 */
import { makeRng } from '../../shared/rng';
import { loadPlan, PLAN_NAMES } from '../../shared/structures';
import { useSim } from '../store';

const SPEEDS = [1, 4, 10] as const;

function planSummary(name: string): string {
  const p = loadPlan(name);
  const levels = new Set(p.spaces.map((s) => s.level)).size;
  return `${name} · ${levels} level${levels === 1 ? '' : 's'} · ${p.spaces.length} spaces`;
}

export function ScenarioPanel() {
  const s = useSim();
  const n = s.trace?.length ?? 0;
  const rec = s.trace?.[s.cursor];

  // The one place a non-deterministic seed is allowed: it only picks the seed, which is
  // then shown and persisted, so the run itself is reproducible.
  const randomSeed = () => s.setSeed(makeRng(Date.now()).int(1, 999_999));

  return (
    <section className="panel-box" aria-label="scenario">
      <h2>Scenario</h2>
      <label htmlFor="sc-plan">structure
        <select id="sc-plan" value={s.planName} onChange={(e) => s.setPlan(e.target.value)}>
          {PLAN_NAMES.map((name) => <option key={name} value={name}>{planSummary(name)}</option>)}
        </select>
      </label>
      <label htmlFor="sc-ignition">fire starts in
        <select id="sc-ignition" value={s.ignition} onChange={(e) => s.setIgnition(e.target.value)}>
          {s.plan.spaces.map((sp) => <option key={sp.id} value={sp.id}>{sp.id}</option>)}
        </select>
      </label>
      <div className="row">
        <label htmlFor="sc-seed">seed <input id="sc-seed" type="number" value={s.seed} onChange={(e) => s.setSeed(Number(e.target.value))} /></label>
        <button type="button" onClick={randomSeed} title="Pick a random seed. The run is still reproducible from the seed shown.">random</button>
      </div>
      <div className="row">
        <label htmlFor="sc-ticks">ticks <input id="sc-ticks" type="number" min={1} max={400} value={s.ticks} onChange={(e) => s.setTicks(Number(e.target.value))} /></label>
        <label>brains
          <span className="seg" role="radiogroup" aria-label="brains">
            <button type="button" role="radio" aria-checked={s.brains === 'ours'} className={s.brains === 'ours' ? 'on' : ''} onClick={() => s.setBrains('ours')}>ours</button>
            <button type="button" role="radio" aria-checked={s.brains === 'both'} className={s.brains === 'both' ? 'on' : ''} onClick={() => s.setBrains('both')}>both</button>
          </span>
        </label>
      </div>
      <button id="sc-run" type="button" className="primary wide" onClick={s.run}>Run</button>

      <h2>Playback</h2>
      <div className="row">
        <button id="sc-play" type="button" onClick={s.toggle} disabled={n === 0}>{s.playing ? 'Pause' : 'Play'}</button>
        <button type="button" aria-label="Step back" onClick={() => s.step(-1)} disabled={n === 0}>−1</button>
        <button type="button" aria-label="Step forward" onClick={() => s.step(1)} disabled={n === 0}>+1</button>
        <label htmlFor="sc-speed">speed
          <select id="sc-speed" value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((v) => <option key={v} value={v}>{v}/s</option>)}
          </select>
        </label>
      </div>
      <label htmlFor="sc-scrub" className="scrub">tick <span className="tick">{rec ? `t=${rec.t}` : '–'}</span>
        <input id="sc-scrub" type="range" min={0} max={Math.max(0, n - 1)} value={s.cursor} onChange={(e) => s.setCursor(Number(e.target.value))} disabled={n === 0} />
      </label>
    </section>
  );
}
