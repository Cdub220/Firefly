/**
 * src/ui — owned by Chase. Two views over one store: Dean's split view (truth | ours |
 * kalman, the checkpoint demo) and the 3D scene (truth rendered on the structure).
 * A thin bar on top switches view and plan. URL params `view`, `plan`, `t` preselect
 * (used for screenshots): /?view=scene&plan=vessel-3x8&t=60
 */
import { useEffect, useState } from 'react';
import { PLAN_NAMES, isPlanName } from '../shared/structures';
import { SplitView } from './split/SplitView';
import { SceneView } from './scene/SceneView';
import { useSim } from './store';
import './split/split.css';
import './app.css';

type View = 'split' | 'scene';

function fromUrl(): { view: View; plan: string | null; t: number | null } {
  try {
    const q = new URLSearchParams(window.location.search);
    const view = q.get('view') === 'scene' ? 'scene' : 'split';
    const plan = q.get('plan');
    const t = q.get('t');
    return { view, plan, t: t !== null && Number.isFinite(Number(t)) ? Number(t) : null };
  } catch {
    return { view: 'split', plan: null, t: null };
  }
}

export function App() {
  const [url] = useState(fromUrl);
  const [view, setView] = useState<View>(url.view);
  const run = useSim((s) => s.run);
  const hasData = useSim((s) => s.data != null);
  const planName = useSim((s) => s.planName);
  const setPlanName = useSim((s) => s.setPlanName);
  const setCursor = useSim((s) => s.setCursor);
  const [pending, setPending] = useState<number | null>(url.t);

  useEffect(() => { if (url.plan && isPlanName(url.plan) && url.plan !== planName) setPlanName(url.plan); }, [url.plan, planName, setPlanName]);
  useEffect(() => { if (!hasData) run(); }, [hasData, run]);
  useEffect(() => {
    // `t` is a tick number; trace[i] holds tick i + 1.
    if (hasData && pending !== null) { setCursor(pending - 1); setPending(null); }
  }, [hasData, pending, setCursor]);

  return (
    <>
      <div className="fx fx-top" role="tablist" aria-label="view">
        <span className="fx-brand">Firefly</span>
        <button type="button" role="tab" aria-selected={view === 'split'} className={view === 'split' ? 'on' : ''} onClick={() => setView('split')}>Split view</button>
        <button type="button" role="tab" aria-selected={view === 'scene'} className={view === 'scene' ? 'on' : ''} onClick={() => setView('scene')}>3D scene</button>
        <label htmlFor="plan">structure
          <select id="plan" value={planName} onChange={(e) => setPlanName(e.target.value)}>
            {PLAN_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {view === 'split' ? <SplitView /> : <SceneView />}
    </>
  );
}
