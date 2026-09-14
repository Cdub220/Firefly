/**
 * src/ui — owned by Chase. Four views over one store: the split view (truth | ours |
 * kalman, the checkpoint demo), the 3D scene, the 3D compare and the head to head. A thin
 * bar on top switches view and plan and toggles recording mode. URL params `view`,
 * `plan`, `t`, `demo`, `beat` preselect: /?view=scene&plan=vessel-3x8&t=60
 *
 * Keys (everywhere, outside inputs): space play/pause, arrows step, 1-6 demo beats,
 * c toggles split <-> head to head, r toggles recording mode.
 */
import { useEffect, useRef, useState } from 'react';
import { PLAN_NAMES, isPlanName } from '../shared/structures';
import { SplitView } from './split/SplitView';
import { SceneView } from './scene/SceneView';
import { CompareView } from './scene/CompareView';
import { HeadToHead } from './compare/HeadToHead';
import { ErrorBoundary } from './ErrorBoundary';
import { VIEWS, fromUrl, useSim } from './store';
import { keyAction } from './hotkeys';
import { usePlayback } from './usePlayback';
import './split/split.css';
import './app.css';

/**
 * The stage backup: pick results/demo-trace.json; beats then replay it. Local file read,
 * no network. Shown in recording mode (where the stage runs), and in any mode while a
 * replay is loaded so nobody forgets it is on.
 */
function ReplayControl() {
  const replay = useSim((s) => s.replay);
  const loadReplay = useSim((s) => s.loadReplay);
  const clearReplay = useSim((s) => s.clearReplay);
  const [why, setWhy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const rejected = loadReplay(JSON.parse(await file.text()));
      setWhy(rejected);
    } catch (e) {
      setWhy(e instanceof Error ? e.message : String(e));
    }
    if (input.current) input.current.value = '';
  };
  return (
    <span className="replay">
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => { void onFile(e.target.files?.[0]); }} />
      {replay ? (
        <button type="button" className="on" title={`Recorded ${replay.exportedAt || 'trace'} · ${replay.beats.map((b) => b.beat).join(', ')}. Click to go back to the live sim.`} onClick={() => { clearReplay(); setWhy(null); }}>replay on · {replay.beats.length} beats</button>
      ) : (
        <button type="button" title="Load results/demo-trace.json (npm run export:trace); the beats then replay the recording instead of simulating" onClick={() => input.current?.click()}>load trace</button>
      )}
      {why && <span className="replay-why" role="alert">{why}</span>}
    </span>
  );
}

export function App() {
  const [url] = useState(fromUrl);
  const view = useSim((s) => s.view);
  const setView = useSim((s) => s.setView);
  const demo = useSim((s) => s.demo);
  const setDemo = useSim((s) => s.setDemo);
  const caption = useSim((s) => s.caption);
  const replayOn = useSim((s) => s.replay !== null);
  const run = useSim((s) => s.run);
  const hasData = useSim((s) => s.data != null);
  const planName = useSim((s) => s.planName);
  const setPlanName = useSim((s) => s.setPlanName);
  const setCursor = useSim((s) => s.setCursor);
  const [pending, setPending] = useState<number | null>(url.t);
  usePlayback();
  // The URL plan is applied once; after that the select owns it.
  const [pendingPlan, setPendingPlan] = useState<string | null>(url.plan);

  useEffect(() => {
    if (pendingPlan === null) return;
    if (isPlanName(pendingPlan) && pendingPlan !== planName) setPlanName(pendingPlan);
    setPendingPlan(null);
  }, [pendingPlan, planName, setPlanName]);
  useEffect(() => {
    // Read the store directly so StrictMode's double effect does not run the sim twice.
    if (pendingPlan === null && useSim.getState().data == null) run();
  }, [hasData, pendingPlan, run]);
  useEffect(() => {
    // `t` is a tick number; trace[i] holds tick i + 1.
    if (hasData && pending !== null) { setCursor(pending - 1); setPending(null); }
  }, [hasData, pending, setCursor]);

  // One keyboard handler for every view; the map itself is pure (hotkeys.ts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const action = keyAction({ key: e.key, tag: el?.tagName, id: el?.id, modifier: e.metaKey || e.ctrlKey || e.altKey });
      if (!action) return;
      // Space on a just-clicked beat button would re-activate it; the map says it is ours.
      e.preventDefault();
      const s = useSim.getState();
      switch (action.kind) {
        case 'toggle': s.toggle(); break;
        case 'step': s.step(action.delta); break;
        case 'compare-toggle': s.setView(s.view === 'h2h' ? 'split' : 'h2h'); break;
        case 'demo-toggle': s.setDemo(!s.demo); break;
        case 'beat': s.runBeat(action.beat); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className={'fx fx-top' + (demo ? ' demo' : '')} role="tablist" aria-label="view">
        <span className="fx-brand">Firefly</span>
        {VIEWS.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>
        ))}
        <label htmlFor="plan">structure
          <select id="plan" value={planName} onChange={(e) => setPlanName(e.target.value)}>
            {PLAN_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {(demo || replayOn) && <ReplayControl />}
        <button id="demo" type="button" className="toggle" aria-pressed={demo} title="Recording mode: bigger words, fewer of them (key r)" onClick={() => setDemo(!demo)}>{demo ? 'Exit recording mode' : 'Recording mode'}</button>
      </div>
      {view !== 'split' && caption && <p className={'fx caption top-caption' + (demo ? ' demo' : '')} aria-live="polite">{caption}</p>}
      <ErrorBoundary key={view} label={VIEWS.find((v) => v.key === view)?.label ?? view}>
        {view === 'split' ? <SplitView /> : view === 'scene' ? <SceneView /> : view === 'compare' ? <CompareView /> : <HeadToHead />}
      </ErrorBoundary>
    </>
  );
}
