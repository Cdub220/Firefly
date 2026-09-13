/**
 * src/ui — Zustand store. Runs both brains on one corrupted observation stream and holds
 * the shaped ViewerData plus playback state. Nothing here computes physics or belief.
 */
import { create } from 'zustand';
import { DEMO_PLAN, runLoopMulti, type TickRecord } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { buildViewerData, type ViewerData } from '../eval/viewerData';
import { loadPlan } from '../shared/structures';
import type { CorruptionConfig, StructurePlan } from '../shared/types';

type Corr = Omit<CorruptionConfig, 'seed'>;

type SimState = {
  plan: StructurePlan;
  planName: string;
  seed: number;
  ticks: number;
  corruption: Corr;
  /** Shaped for the split view. */
  data: ViewerData | null;
  /** Raw primary-brain trace for the 3D scene: trace[cursor].truth and .obs are exact. */
  trace: TickRecord[] | null;
  error: string | null;
  cursor: number;
  playing: boolean;
  speed: number;
  run: () => void;
  setPlanName: (name: string) => void;
  setSeed: (seed: number) => void;
  setTicks: (ticks: number) => void;
  setCorruption: (patch: Partial<Corr>) => void;
  setCursor: (i: number) => void;
  stepBy: (d: number) => void;
  /** Advance one tick; stops playback at the end. */
  tick: () => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
};

const KEY = 'firefly.split.v1';
function load(): Partial<Pick<SimState, 'seed' | 'ticks' | 'corruption'>> {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Partial<Pick<SimState, 'seed' | 'ticks' | 'corruption'>>) : {}; } catch { return {}; }
}
function save(s: Pick<SimState, 'seed' | 'ticks' | 'corruption'>): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const saved = load();
const DEFAULT_CORR: Corr = { mode: 'freeze', k: 1, onset: 5, target: [DEMO_PLAN.ignition[0] ?? 'S3'] };

export const useSim = create<SimState>((set, get) => ({
  plan: DEMO_PLAN,
  planName: DEMO_PLAN.name,
  seed: saved.seed ?? 42,
  ticks: saved.ticks ?? 60,
  corruption: saved.corruption ?? DEFAULT_CORR,
  data: null,
  trace: null,
  error: null,
  cursor: 0,
  playing: false,
  speed: 4,
  run: () => {
    const { plan, seed, ticks, corruption } = get();
    save({ seed, ticks, corruption });
    try {
      const traces = runLoopMulti({ plan, seed, ticks, corruption, brains: { ours: createBrain, kalman: createKalmanBrain }, primary: 'ours' });
      const data = buildViewerData(plan, traces, { seed, corruption });
      set({ data, trace: traces['ours'] ?? null, error: null, cursor: data.startAt, playing: false });
    } catch (e) {
      set({ error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e), playing: false });
    }
  },
  setPlanName: (name) => {
    if (name === get().planName) return;
    const plan = loadPlan(name);
    // A corruption target from the old plan is meaningless here; aim at the new ignition space.
    const target = plan.ignition.length ? [...plan.ignition] : [];
    set({ plan, planName: name, corruption: { ...get().corruption, target }, data: null, trace: null, cursor: 0, playing: false, error: null });
  },
  setSeed: (seed) => set({ seed }),
  setTicks: (ticks) => set({ ticks }),
  setCorruption: (patch) => set({ corruption: { ...get().corruption, ...patch } }),
  setCursor: (i) => { const n = get().data?.ticks.length ?? 0; set({ cursor: Math.max(0, Math.min(n - 1, i)) }); },
  stepBy: (d) => {
    const { cursor, data } = get(); const n = data?.ticks.length ?? 0;
    const next = Math.max(0, Math.min(n - 1, cursor + d));
    set({ cursor: next, playing: get().playing && next < n - 1 });
  },
  tick: () => get().stepBy(1),
  toggle: () => {
    const { playing, cursor, data } = get(); const n = data?.ticks.length ?? 0;
    if (!data) return;
    if (playing) return set({ playing: false });
    set({ playing: true, cursor: cursor >= n - 1 ? 0 : cursor });
  },
  setSpeed: (speed) => set({ speed }),
}));
