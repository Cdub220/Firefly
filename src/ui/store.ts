/**
 * src/ui — Zustand store. Everything the UI runs is driven from this config: plan, seed,
 * ticks, corruption, which brains. `run()` feeds every selected brain one identical
 * corrupted observation stream (runLoopMulti) and holds the raw traces plus the shaped
 * ViewerData the split view renders. Nothing here computes physics or belief.
 *
 * Playback lives in one place: usePlayback() in src/ui/usePlayback.ts, mounted once by App.
 */
import { create } from 'zustand';
import { DEMO_PLAN, runLoopMulti, type BrainFactory, type TickRecord } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { buildViewerData, type ViewerData } from '../eval/viewerData';
import { isPlanName, loadPlan } from '../shared/structures';
import type { CorruptionConfig, StructurePlan } from '../shared/types';

export type Corr = Omit<CorruptionConfig, 'seed'>;
export type Brains = 'ours' | 'both';

/** Brain factories by name. `primary` is always 'ours'; its commands drive the world. */
export const BRAIN_FACTORIES: Record<Brains, Record<string, BrainFactory>> = {
  ours: { ours: createBrain },
  both: { ours: createBrain, kalman: createKalmanBrain },
};
export const PRIMARY = 'ours';

export type SimState = {
  plan: StructurePlan;
  planName: string;
  /** Where the fire starts. The plan file's ignition space by default; the picker overrides it for demos. */
  ignition: string;
  seed: number;
  ticks: number;
  corruption: Corr;
  brains: Brains;
  /** Raw per-brain traces from the last run. Every brain saw byte-identical observations. */
  traces: Record<string, TickRecord[]>;
  primary: string;
  /** Shaped for the split view. */
  data: ViewerData | null;
  /** traces[primary], kept as a field for the 3D scene: trace[cursor].truth and .obs are exact. */
  trace: TickRecord[] | null;
  error: string | null;
  cursor: number;
  playing: boolean;
  speed: number;
  run: () => void;
  setPlan: (name: string) => void;
  /** Alias of setPlan. */
  setPlanName: (name: string) => void;
  setSeed: (seed: number) => void;
  setIgnition: (id: string) => void;
  setTicks: (ticks: number) => void;
  setCorruption: (patch: Partial<Corr>) => void;
  setBrains: (brains: Brains) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Move the cursor by delta, clamped; playback stops at the last tick. */
  step: (delta: number) => void;
  /** Alias of step. */
  stepBy: (delta: number) => void;
  /** step(1). */
  tick: () => void;
  setCursor: (i: number) => void;
  setSpeed: (speed: number) => void;
};

/** Persisted subset. Versioned key: bump when the shape changes. */
const KEY = 'firefly.sim.v2';
type Saved = Partial<Pick<SimState, 'planName' | 'seed' | 'ticks' | 'corruption' | 'ignition' | 'brains'>>;
function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Saved) : {};
  } catch {
    return {};
  }
}
function save(s: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: run anyway */ }
}

/**
 * A corruption target names spaces, and spaces belong to a plan. Drop targets the plan does
 * not have (a saved config from another plan, or a typo); if that empties the list, aim at
 * the plan's ignition space so a targeted mode still does something. Pure; exported for tests.
 */
export function sanitizeCorruption(corr: Corr, plan: StructurePlan): Corr {
  if (corr.target === undefined) return corr;
  const known = new Set(plan.spaces.map((s) => s.id));
  const kept = corr.target.filter((id) => known.has(id));
  if (kept.length === corr.target.length) return corr;
  const target = kept.length > 0 ? kept : [...plan.ignition];
  return { ...corr, target };
}

/** An ignition space must exist in the plan; otherwise use the plan's own. */
export function sanitizeIgnition(ignition: string | undefined, plan: StructurePlan): string {
  if (ignition !== undefined && plan.spaces.some((s) => s.id === ignition)) return ignition;
  return plan.ignition[0] ?? plan.spaces[0]?.id ?? '';
}

const MODES: readonly CorruptionConfig['mode'][] = ['none', 'freeze', 'blind', 'saturate', 'flashover', 'mixed'];
const NUMERIC_FIELDS = ['k', 'onset', 'flashoverTemp', 'saturateAt', 'ambient'] as const;

/**
 * Persisted corruption is untrusted: keep only a known mode, finite numbers, and a string
 * array target. Anything else is dropped so a hand-edited or stale blob cannot crash the
 * store at module load. Pure; exported for tests.
 */
export function coerceCorruption(raw: unknown, fallback: Corr): Corr {
  if (raw === null || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const mode = typeof r['mode'] === 'string' && (MODES as readonly string[]).includes(r['mode']) ? (r['mode'] as CorruptionConfig['mode']) : fallback.mode;
  const out: Corr = { mode };
  for (const key of NUMERIC_FIELDS) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  const t = r['target'];
  if (Array.isArray(t) && t.every((x) => typeof x === 'string')) out.target = t as string[];
  return out;
}

const saved = load();
const initialPlan: StructurePlan = saved.planName !== undefined && isPlanName(saved.planName) ? loadPlan(saved.planName) : DEMO_PLAN;
const DEFAULT_CORR: Corr = { mode: 'freeze', k: 1, onset: 5, target: [...initialPlan.ignition] };
const isBrains = (v: unknown): v is Brains => v === 'ours' || v === 'both';

export const useSim = create<SimState>((set, get) => ({
  plan: initialPlan,
  planName: initialPlan.name,
  ignition: sanitizeIgnition(saved.ignition, initialPlan),
  seed: typeof saved.seed === 'number' && Number.isFinite(saved.seed) ? Math.round(saved.seed) : 42,
  ticks: typeof saved.ticks === 'number' && Number.isFinite(saved.ticks) && saved.ticks >= 1 ? Math.round(saved.ticks) : 60,
  corruption: sanitizeCorruption(saved.corruption === undefined ? DEFAULT_CORR : coerceCorruption(saved.corruption, DEFAULT_CORR), initialPlan),
  brains: isBrains(saved.brains) ? saved.brains : 'both',
  traces: {},
  primary: PRIMARY,
  data: null,
  trace: null,
  error: null,
  cursor: 0,
  playing: false,
  speed: 4,

  run: () => {
    const { plan: base, planName, seed, ticks, brains } = get();
    const corruption = sanitizeCorruption(get().corruption, base);
    const ignition = sanitizeIgnition(get().ignition, base);
    if (corruption !== get().corruption || ignition !== get().ignition) set({ corruption, ignition });
    save({ planName, seed, ticks, corruption, ignition, brains });
    // The plan file says where the fire starts; the picker overrides it for demos.
    const plan: StructurePlan = { ...base, ignition: [ignition] };
    try {
      if (!Number.isFinite(ticks) || ticks < 1) throw new Error(`ticks must be at least 1 (got ${ticks})`);
      const traces = runLoopMulti({ plan, seed, ticks, corruption, brains: BRAIN_FACTORIES[brains], primary: PRIMARY });
      const data = buildViewerData(plan, traces, { seed, corruption });
      const trace = traces[PRIMARY] ?? null;
      // Open two ticks before the failure begins (data.startAt) so the demo starts where it
      // matters, but never past the end of a short run.
      const cursor = Math.max(0, Math.min(data.startAt, (trace?.length ?? 1) - 1));
      set({ traces, data, trace, error: null, cursor, playing: false });
    } catch (e) {
      set({ error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e), playing: false });
    }
  },

  setPlan: (name) => {
    if (name === get().planName) return;
    const plan = loadPlan(name);
    // A corruption target from the old plan is meaningless here; aim at the new ignition space.
    const corruption = sanitizeCorruption({ ...get().corruption, target: [...plan.ignition] }, plan);
    const ignition = sanitizeIgnition(undefined, plan);
    set({ plan, planName: name, ignition, corruption, traces: {}, data: null, trace: null, cursor: 0, playing: false, error: null });
  },
  setPlanName: (name) => get().setPlan(name),
  setSeed: (seed) => { if (Number.isFinite(seed)) set({ seed: Math.round(seed) }); },
  setIgnition: (ignition) => set({ ignition }),
  setTicks: (ticks) => { if (Number.isFinite(ticks)) set({ ticks: Math.max(1, Math.round(ticks)) }); },
  setCorruption: (patch) => set({ corruption: { ...get().corruption, ...patch } }),
  setBrains: (brains) => set({ brains }),

  play: () => {
    const { cursor, trace } = get();
    const n = trace?.length ?? 0;
    if (n === 0) return;
    set({ playing: true, cursor: cursor >= n - 1 ? 0 : cursor });
  },
  pause: () => set({ playing: false }),
  toggle: () => (get().playing ? get().pause() : get().play()),
  step: (delta) => {
    const { cursor, trace } = get();
    const n = trace?.length ?? 0;
    if (n === 0) return;
    const next = Math.max(0, Math.min(n - 1, cursor + delta));
    set({ cursor: next, playing: get().playing && next < n - 1 });
  },
  stepBy: (delta) => get().step(delta),
  tick: () => get().step(1),
  setCursor: (i) => {
    if (!Number.isFinite(i)) return;
    const n = get().trace?.length ?? 0;
    set({ cursor: Math.max(0, Math.min(n - 1, Math.round(i))) });
  },
  setSpeed: (speed) => { if (Number.isFinite(speed) && speed > 0) set({ speed }); },
}));

/** The primary brain's record at the cursor, or undefined before a run. */
export const useCurrent = (): TickRecord | undefined => useSim((s) => s.traces[s.primary]?.[s.cursor]);
/** A named brain's record at the cursor, or undefined if that brain did not run. */
export const useCurrentFor = (name: string): TickRecord | undefined => useSim((s) => s.traces[name]?.[s.cursor]);
