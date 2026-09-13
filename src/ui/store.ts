/**
 * src/ui — Zustand store. Runs both brains on one corrupted observation stream and holds
 * the shaped ViewerData plus playback state. Nothing here computes physics or belief.
 *
 * Plans are picked by name from src/shared/structures.ts; `plan` is derived from
 * `planName`. Demo beats set the whole scenario in one click (and one key) and carry a
 * caption for the video. Recording mode (`?demo=1` or the toggle) hides the tuning
 * controls. All of that is state here so it is testable under node.
 */
import { create } from 'zustand';
import { runLoop, runLoopMulti, type TickRecord } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain } from '../brain/kalman';
import { buildViewerData, type ViewerData } from '../eval/viewerData';
import { edgeMap } from '../shared/plan';
import { isPlanName, loadPlan, PLAN_NAMES } from '../shared/structures';
import type { CorruptionConfig, SpaceId, StructurePlan } from '../shared/types';

type Corr = Omit<CorruptionConfig, 'seed'>;

export type Beat = 'clean' | 'freeze' | 'blind' | 'flashover' | 'building';
export const BEATS: ReadonlyArray<{ key: Beat; label: string; hotkey: string }> = [
  { key: 'clean', label: 'Clean', hotkey: '1' },
  { key: 'freeze', label: "Freeze the fire's sensor", hotkey: '2' },
  { key: 'blind', label: 'Blind the neighbor', hotkey: '3' },
  { key: 'flashover', label: 'Flashover', hotkey: '4' },
  { key: 'building', label: 'Different building', hotkey: '5' },
];
const BEAT_ONSET = 5;
const NEIGHBOR_PROBE_TICKS = 10; // "hottest neighbor" is read off a clean run at this tick

type SimState = {
  planName: string;
  /** Derived from planName. */
  plan: StructurePlan;
  /** Where the fire starts. The plan file's ignition space by default; the picker overrides it for demos. */
  ignition: string;
  seed: number;
  ticks: number;
  corruption: Corr;
  /** Shaped for the split view. */
  data: ViewerData | null;
  /** Raw primary-brain trace: trace[cursor].truth and .obs are exact. */
  trace: TickRecord[] | null;
  error: string | null;
  cursor: number;
  playing: boolean;
  speed: number;
  /** Recording mode: hides the scenario controls and the how-to-read notes. */
  demo: boolean;
  /** One sentence under the header, set by the last demo beat. */
  caption: string;
  beat: Beat | null;
  run: () => void;
  runBeat: (beat: Beat) => void;
  setPlanName: (name: string) => void;
  setSeed: (seed: number) => void;
  setIgnition: (id: string) => void;
  setTicks: (ticks: number) => void;
  setCorruption: (patch: Partial<Corr>) => void;
  setDemo: (on: boolean) => void;
  setCursor: (i: number) => void;
  stepBy: (d: number) => void;
  /** Advance one tick; stops playback at the end. */
  tick: () => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
};

const KEY = 'firefly.split.v2';
type Saved = Partial<Pick<SimState, 'seed' | 'ticks' | 'corruption' | 'ignition' | 'planName'>>;
function load(): Saved {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Saved) : {}; } catch { return {}; }
}
function save(s: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
/** URL presets for filming: ?demo=1 hides the controls, ?plan=<name> picks the structure, ?beat=<key> runs a beat on load, ?t=<tick> scrubs there. */
export function fromUrl(search?: string): { demo: boolean; beat: Beat | null; t: number | null; plan: string | null } {
  try {
    const q = new URLSearchParams(search ?? window.location.search);
    const beat = q.get('beat');
    const t = q.get('t');
    const plan = q.get('plan');
    return {
      demo: q.get('demo') === '1',
      beat: BEATS.some((b) => b.key === beat) ? (beat as Beat) : null,
      t: t !== null && Number.isFinite(Number(t)) ? Number(t) : null,
      plan: plan !== null && isPlanName(plan) ? plan : null,
    };
  } catch {
    return { demo: false, beat: null, t: null, plan: null };
  }
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

/** Why a run cannot happen, as one sentence for the page, or null. */
export function validateRun(plan: StructurePlan, ignition: string, ticks: number): string | null {
  if (plan.spaces.length === 0) return `plan "${plan.name}" has no spaces.`;
  if (!plan.spaces.some((s) => s.id === ignition)) return `ignition space "${ignition}" is not in plan "${plan.name}" (spaces: ${plan.spaces.map((s) => s.id).join(', ')}).`;
  if (plan.sensors.length === 0) return `plan "${plan.name}" has no sensors: the brains would see nothing. Add fixed sensors to the plan file.`;
  if (!Number.isFinite(ticks) || ticks < 1) return `ticks must be at least 1 (got ${ticks}).`;
  return null;
}

/** The ignition space's neighbor that is hottest at tick 10 of a clean run. Null if it has none. */
export function hottestNeighbor(plan: StructurePlan, ignition: string, seed = 42): SpaceId | null {
  const neighbors = (edgeMap(plan).get(ignition) ?? []).map((e) => e.b);
  if (neighbors.length === 0) return null;
  const trace = runLoop({ plan: { ...plan, ignition: [ignition] }, seed, ticks: NEIGHBOR_PROBE_TICKS, brain: createBrain });
  const last = trace[trace.length - 1];
  const temp = new Map(last?.truth.spaces.map((s) => [s.id, s.temp]) ?? []);
  return [...neighbors].sort((a, b) => (temp.get(b) ?? -Infinity) - (temp.get(a) ?? -Infinity) || a.localeCompare(b))[0] ?? null;
}

/** The name after `current` in `names`, wrapping; `current` itself if unlisted or the list is empty. */
export function nextIn(names: readonly string[], current: string): string {
  if (names.length === 0) return current;
  const i = names.indexOf(current);
  return names[(i + 1) % names.length] ?? current;
}
export function nextPlanName(current: string): string {
  return nextIn(PLAN_NAMES, current);
}

/** Everything a beat sets, as data. Pure; exported for tests. */
export function beatConfig(
  beat: Beat,
  cur: { planName: string; plan: StructurePlan; ignition: string; corruption: Corr; seed: number },
): { planName: string; ignition: string; corruption: Corr; caption: string } {
  const { plan, planName, seed } = cur;
  const ignition = sanitizeIgnition(cur.ignition, plan);
  switch (beat) {
    case 'clean':
      return { planName, ignition, corruption: { mode: 'none' }, caption: 'Every sensor is honest. Both brains track the fire; the difference is how each earns its confidence.' };
    case 'freeze':
      return {
        planName, ignition, corruption: { mode: 'freeze', k: 1, onset: BEAT_ONSET, target: [ignition] },
        caption: `The sensor in the burning room (${ignition}) froze at tick ${BEAT_ONSET}. Watch the right panel stay at 0.97 while the fire moves.`,
      };
    case 'blind': {
      const nb = hottestNeighbor(plan, ignition, seed) ?? ignition;
      return {
        planName, ignition, corruption: { mode: 'blind', k: 1, onset: BEAT_ONSET, target: [nb] },
        caption: `Smoke blinded the sensor next door (${nb}) at tick ${BEAT_ONSET}: it reads room temperature beside a fire. Ours flags it; Kalman believes it.`,
      };
    }
    case 'flashover':
      return {
        planName, ignition, corruption: { mode: 'flashover', onset: BEAT_ONSET },
        caption: `From tick ${BEAT_ONSET}, every sensor in a space over 500° dies. The hotter the fire, the less the brains can see. One of them says so.`,
      };
    case 'building': {
      const nextName = nextPlanName(planName);
      const next = loadPlan(nextName);
      const nextIgnition = sanitizeIgnition(undefined, next);
      const base: Corr = { ...cur.corruption };
      const retargeted: Corr = base.mode === 'blind'
        ? { ...base, target: [hottestNeighbor(next, nextIgnition, seed) ?? nextIgnition] }
        : base.target === undefined ? base : { ...base, target: [nextIgnition] };
      const corruption = sanitizeCorruption(retargeted, next);
      const same = nextName === planName;
      return {
        planName: nextName, ignition: nextIgnition, corruption,
        caption: same
          ? `Only one structure is loaded (${planName}); the same brains and failure mode run again on it. Nothing here is specific to this building.`
          : `Same brains, same failure mode (${base.mode}), different structure: ${nextName}. Nothing retrained; the plan is a JSON file.`,
      };
    }
  }
}

const saved = load();
const urlPlan = fromUrl().plan;
const initialPlanName = urlPlan ?? (PLAN_NAMES.includes(saved.planName as (typeof PLAN_NAMES)[number]) ? saved.planName! : (PLAN_NAMES[0] ?? 'demo-6'));
const initialPlan = loadPlan(initialPlanName);
const DEFAULT_CORR: Corr = { mode: 'freeze', k: 1, onset: BEAT_ONSET, target: [initialPlan.ignition[0] ?? ''] };

export const useSim = create<SimState>((set, get) => {
  /** Run the current scenario. Shared by run() and runBeat(). */
  const execute = (): void => {
    const { plan: base, planName, seed, ticks } = get();
    const corruption = sanitizeCorruption(get().corruption, base);
    if (corruption !== get().corruption) set({ corruption });
    const ignition = get().ignition;
    save({ seed, ticks, corruption, ignition, planName });
    const why = validateRun(base, ignition, ticks);
    if (why) {
      set({ error: `Cannot run: ${why}`, data: null, trace: null, playing: false });
      return;
    }
    // The plan file says where the fire starts; the picker overrides it for demos.
    const plan: StructurePlan = { ...base, ignition: [ignition] };
    try {
      const traces = runLoopMulti({ plan, seed, ticks, corruption, brains: { ours: createBrain, kalman: createKalmanBrain }, primary: 'ours' });
      const data = buildViewerData(plan, traces, { seed, corruption });
      if (data.ticks.length === 0) throw new Error('the run produced no ticks');
      // startAt is two ticks before onset; a very short run may not reach it.
      set({ data, trace: traces['ours'] ?? null, error: null, cursor: Math.max(0, Math.min(data.startAt, data.ticks.length - 1)), playing: false });
    } catch (e) {
      set({ error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e), data: null, trace: null, playing: false });
    }
  };
  return {
  planName: initialPlanName,
  plan: initialPlan,
  ignition: sanitizeIgnition(saved.ignition, initialPlan),
  seed: saved.seed ?? 42,
  ticks: saved.ticks ?? 60,
  corruption: sanitizeCorruption(saved.corruption ?? DEFAULT_CORR, initialPlan),
  data: null,
  trace: null,
  error: null,
  cursor: 0,
  playing: false,
  speed: 4,
  demo: fromUrl().demo,
  caption: '',
  beat: null,
  run: () => {
    // A manual run is not a beat: the caption would describe a scenario no longer shown.
    if (get().beat !== null || get().caption !== '') set({ beat: null, caption: '' });
    execute();
  },
  runBeat: (beat) => {
    const { planName, plan, ignition, corruption, seed } = get();
    const cfg = beatConfig(beat, { planName, plan, ignition, corruption, seed });
    set({ planName: cfg.planName, plan: loadPlan(cfg.planName), ignition: cfg.ignition, corruption: cfg.corruption, caption: cfg.caption, beat });
    execute();
  },
  setPlanName: (name) => {
    if (name === get().planName) return;
    const plan = loadPlan(name);
    // A corruption target from the old plan is meaningless here; aim at the new ignition space.
    const corruption = sanitizeCorruption({ ...get().corruption, target: [...plan.ignition] }, plan);
    const ignition = sanitizeIgnition(undefined, plan);
    set({ plan, planName: name, ignition, corruption, data: null, trace: null, cursor: 0, playing: false, error: null, beat: null, caption: '' });
  },
  setSeed: (seed) => set({ seed }),
  setIgnition: (ignition) => set({ ignition }),
  setTicks: (ticks) => set({ ticks }),
  setCorruption: (patch) => set({ corruption: { ...get().corruption, ...patch }, beat: null, caption: '' }),
  setDemo: (on) => set({ demo: on }),
  setCursor: (i) => {
    if (!Number.isFinite(i)) return;
    const n = get().data?.ticks.length ?? 0;
    set({ cursor: Math.max(0, Math.min(n - 1, Math.round(i))) });
  },
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
  };
});
