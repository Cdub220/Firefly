/**
 * src/ui — Zustand store. Runs both brains on one corrupted observation stream and holds
 * the shaped ViewerData plus playback state. Nothing here computes physics or belief.
 */
import { create } from 'zustand';
import { DEMO_PLAN, runLoopMulti } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { buildViewerData, type ViewerData } from '../eval/viewerData';
import type { CorruptionConfig, StructurePlan } from '../shared/types';

type Corr = Omit<CorruptionConfig, 'seed'>;

type SimState = {
  plan: StructurePlan;
  ignition: string;
  seed: number;
  ticks: number;
  corruption: Corr;
  data: ViewerData | null;
  error: string | null;
  cursor: number;
  playing: boolean;
  speed: number;
  run: () => void;
  setSeed: (seed: number) => void;
  setIgnition: (id: string) => void;
  setTicks: (ticks: number) => void;
  setCorruption: (patch: Partial<Corr>) => void;
  setCursor: (i: number) => void;
  stepBy: (d: number) => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
};

const KEY = 'firefly.split.v1';
type Saved = Partial<Pick<SimState, 'seed' | 'ticks' | 'corruption' | 'ignition'>>;
function load(): Saved {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Saved) : {}; } catch { return {}; }
}
function save(s: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const saved = load();
const DEFAULT_CORR: Corr = { mode: 'freeze', k: 1, onset: 5, target: [DEMO_PLAN.ignition[0] ?? 'S3'] };

export const useSim = create<SimState>((set, get) => ({
  plan: DEMO_PLAN,
  ignition: saved.ignition ?? DEMO_PLAN.ignition[0] ?? 'S3',
  seed: saved.seed ?? 42,
  ticks: saved.ticks ?? 60,
  corruption: saved.corruption ?? DEFAULT_CORR,
  data: null,
  error: null,
  cursor: 0,
  playing: false,
  speed: 4,
  run: () => {
    const { plan: base, ignition, seed, ticks, corruption } = get();
    save({ seed, ticks, corruption, ignition });
    // The plan file says where the fire starts; the picker overrides it for demos.
    const plan: StructurePlan = { ...base, ignition: [ignition] };
    try {
      const traces = runLoopMulti({ plan, seed, ticks, corruption, brains: { ours: createBrain, kalman: createKalmanBrain }, primary: 'ours' });
      const data = buildViewerData(plan, traces, { seed, corruption });
      set({ data, error: null, cursor: data.startAt, playing: false });
    } catch (e) {
      set({ error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e), playing: false });
    }
  },
  setSeed: (seed) => set({ seed }),
  setIgnition: (ignition) => set({ ignition }),
  setTicks: (ticks) => set({ ticks }),
  setCorruption: (patch) => set({ corruption: { ...get().corruption, ...patch } }),
  setCursor: (i) => { const n = get().data?.ticks.length ?? 0; set({ cursor: Math.max(0, Math.min(n - 1, i)) }); },
  stepBy: (d) => {
    const { cursor, data } = get(); const n = data?.ticks.length ?? 0;
    const next = Math.max(0, Math.min(n - 1, cursor + d));
    set({ cursor: next, playing: get().playing && next < n - 1 });
  },
  toggle: () => {
    const { playing, cursor, data } = get(); const n = data?.ticks.length ?? 0;
    if (!data) return;
    if (playing) return set({ playing: false });
    set({ playing: true, cursor: cursor >= n - 1 ? 0 : cursor });
  },
  setSpeed: (speed) => set({ speed }),
}));
