/**
 * src/ui — Zustand store. Everything the UI runs is driven from this config: plan, seed,
 * ticks, corruption, which brains. `run()` feeds every selected brain one identical
 * corrupted observation stream (runLoopMulti) and holds the raw traces plus the shaped
 * ViewerData the split view renders. Nothing here computes physics or belief.
 *
 * Plans are picked by name from src/shared/structures.ts; `plan` is derived from
 * `planName`. Demo beats set the whole scenario in one click (and one key) and carry a
 * caption for the video. Recording mode (`?demo=1` or the toggle) hides the tuning
 * controls. All of that is state here so it is testable under node.
 *
 * Playback lives in one place: usePlayback() in src/ui/usePlayback.ts, mounted once by App.
 */
import { create } from 'zustand';
import { runLoop, runLoopMulti, type BrainFactory, type TickRecord } from '../loop';
import { createBrain } from '../brain';
import { createKalmanBrain, createKalmanDispatching } from '../brain/kalman';
import { buildViewerData, type ViewerData } from '../eval/viewerData';
import { edgeMap } from '../shared/plan';
import { isPlanName, loadPlan, PLAN_NAMES } from '../shared/structures';
import type { CorruptionConfig, SpaceId, StructurePlan } from '../shared/types';
import { parseDemoTrace, type DemoTrace } from './demoTrace';
import { createCommander } from '../incident/commander';
import incidentTimeline from '../../data/incidents/one-meridian-plaza/timeline.json';

export type Corr = Omit<CorruptionConfig, 'seed'>;
/** A partial where undefined is allowed and means "remove this key". */
export type CorrPatch = { [K in keyof Corr]?: Corr[K] | undefined };
export type Brains = 'ours' | 'both';

export type View = 'split' | 'scene' | 'compare' | 'h2h' | 'casefile';
export const VIEWS: ReadonlyArray<{ key: View; label: string }> = [
  { key: 'split', label: 'Split view' },
  { key: 'scene', label: '3D scene' },
  { key: 'compare', label: '3D compare' },
  { key: 'h2h', label: 'Head to head' },
  { key: 'casefile', label: 'Case file' },
];
export const isView = (v: unknown): v is View => VIEWS.some((x) => x.key === v);

/**
 * The demo script: five beats in pitch order on keys 1-5, so nobody types on stage.
 * `blind` (key 6) is the CP3 beat, kept for the recorded videos and `?beat=blind`.
 */
export type Beat = 'clean' | 'freeze' | 'flashover' | 'compare' | 'building' | 'blind' | 'casefile';
export const BEATS: ReadonlyArray<{ key: Beat; label: string; hotkey: string }> = [
  { key: 'clean', label: 'Clean run', hotkey: '1' },
  { key: 'freeze', label: "Freeze the fire's sensor", hotkey: '2' },
  { key: 'flashover', label: 'Flashover', hotkey: '3' },
  { key: 'compare', label: 'Head to head', hotkey: '4' },
  { key: 'building', label: 'Different building', hotkey: '5' },
  { key: 'blind', label: 'Blind the neighbor', hotkey: '6' },
  { key: 'casefile', label: 'Case file: a real fire', hotkey: '7' },
];
/** The incident replay (docs/10-incident-replay-plan.md): the plan, the run length and the brains it is shown with. */
export const CASEFILE = { plan: 'highrise-12x9', minutes: incidentTimeline.outcome.durationMinutes, tickMinutes: incidentTimeline.tickMinutes, name: incidentTimeline.name } as const;
/**
 * How far the page simulates: the calibrated fire is out at minute 596 (results.json
 * lastFire), so 640 minutes covers every sim event; the record's strip still runs to
 * 1118. 160 ticks × three brains on 108 spaces is ~5 s on the main thread instead of ~9.
 */
export const CASEFILE_RUN_MINUTES = 640;
export const CASEFILE_TICKS = Math.ceil(CASEFILE_RUN_MINUTES / CASEFILE.tickMinutes);
export const INCIDENT_FACTORIES: Record<string, BrainFactory> = { ours: createBrain, kalman: createKalmanBrain, commander: createCommander(incidentTimeline.commanderKnowledge, CASEFILE.tickMinutes) };
/**
 * Which plan files the script opens and closes on. Data, not logic: the beats work on
 * any plan, and fall back to the current plan (clean) or the next one (building) when a
 * name is not in data/structures.
 */
export const SCRIPT_PLANS = { first: 'vessel-3x8', last: 'tower-5x4' } as const;
const BEAT_ONSET = 5;
const NEIGHBOR_PROBE_TICKS = 10; // "hottest neighbor" is read off a clean run at this tick

/** Pure: apply a CorrPatch to a Corr. Exported for tests. */
export function applyCorruptionPatch(base: Corr, patch: CorrPatch): Corr {
  const next: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || (k === 'target' && Array.isArray(v) && v.length === 0)) delete next[k];
    else next[k] = v;
  }
  return next as Corr;
}

/** Brain factories by name. `primary` is always 'ours'; its commands drive the world. */
export const BRAIN_FACTORIES: Record<Brains, Record<string, BrainFactory>> = {
  ours: { ours: createBrain },
  both: { ours: createBrain, kalman: createKalmanBrain },
};
/**
 * Head-to-head factories: each brain gets Dean's allocator so a fair fight is
 * "same drones, two beliefs", not "one brain commands, the other watches".
 */
export const H2H_FACTORIES: Record<string, BrainFactory> = { ours: createBrain, kalman: createKalmanDispatching };
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
  /**
   * Closed loop: the primary brain's commands move the drones. Off by default so the
   * split view shows the open-loop family the frozen estimator's numbers are reported on;
   * the head-to-head is always closed loop.
   */
  dispatch: boolean;
  /** Whether the run on screen actually applied commands. Beats ignore the toggle; the head to head forces it on. */
  closedLoop: boolean;
  /** Raw per-brain traces from the last run. Every brain saw byte-identical observations. */
  traces: Record<string, TickRecord[]>;
  primary: string;
  /** Shaped for the split view. */
  data: ViewerData | null;
  /** traces[primary], kept as a field for the 3D scene: trace[cursor].truth and .obs are exact. */
  trace: TickRecord[] | null;
  /**
   * Head-to-head: the same scenario run twice, once with each brain driving the world,
   * keyed by the driving brain. Only that brain's commands reach the world, so the two
   * truth curves can differ. null until runCompare().
   */
  compare: Record<string, TickRecord[]> | null;
  error: string | null;
  cursor: number;
  playing: boolean;
  speed: number;
  /** Recording mode: hides the scenario controls and the how-to-read notes. */
  demo: boolean;
  /** One sentence under the header, set by the last demo beat. */
  caption: string;
  beat: Beat | null;
  /** Which page is showing. State, not App-local, so a beat (and the `c` key) can switch it. */
  view: View;
  /** The demo's tick count while the case file beat has replaced it with the incident's; restored by the next beat, run or plan change. */
  ticksBeforeCasefile: number | null;
  /** A sentence while a long simulation runs on the main thread (the page paints it before the run starts); null otherwise. */
  busy: string | null;
  /**
   * Backup for the stage: a recorded demo trace (results/demo-trace.json, `npm run
   * export:trace`). While loaded, runBeat() replays the recorded run for that beat instead
   * of simulating. Manual runs still simulate.
   */
  replay: DemoTrace | null;
  run: () => void;
  runBeat: (beat: Beat) => void;
  setView: (view: View) => void;
  /** Parse and hold a demo trace; returns the reason it was rejected, or null. */
  loadReplay: (json: unknown) => string | null;
  clearReplay: () => void;
  /** run(), then the same scenario again with kalman driving; fills `compare`. */
  runCompare: () => void;
  /**
   * The head-to-head demo scenario: the ignition sensor goes blind on the first tick, then
   * runCompare(). With a later onset both brains have already locked on and both worlds
   * contain; blind from t=1 is where a wrong belief actually costs the world.
   */
  runShowdown: () => void;
  setPlan: (name: string) => void;
  /** Alias of setPlan. */
  setPlanName: (name: string) => void;
  setSeed: (seed: number) => void;
  setIgnition: (id: string) => void;
  setTicks: (ticks: number) => void;
  /**
   * Merge a patch. A key set to undefined is REMOVED (back to the corruptor's default);
   * an empty `target` array is removed too, because to the corruptor `[]` means "no sensor
   * qualifies" while an absent target means "any sensor".
   */
  setCorruption: (patch: CorrPatch) => void;
  setBrains: (brains: Brains) => void;
  setDispatch: (on: boolean) => void;
  setDemo: (on: boolean) => void;
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
type Saved = Partial<Pick<SimState, 'planName' | 'seed' | 'ticks' | 'corruption' | 'ignition' | 'brains' | 'dispatch'>>;
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

/** URL presets for filming: ?demo=1 hides the controls, ?view=<page>, ?plan=<name> picks the structure, ?beat=<key> runs a beat on load, ?t=<tick> scrubs there. */
export function fromUrl(search?: string): { demo: boolean; beat: Beat | null; t: number | null; plan: string | null; view: View } {
  try {
    const q = new URLSearchParams(search ?? window.location.search);
    const beat = q.get('beat');
    const t = q.get('t');
    const plan = q.get('plan');
    const view = q.get('view');
    return {
      demo: q.get('demo') === '1',
      beat: BEATS.some((b) => b.key === beat) ? (beat as Beat) : null,
      t: t !== null && Number.isFinite(Number(t)) ? Number(t) : null,
      plan: plan !== null && isPlanName(plan) ? plan : null,
      view: isView(view) ? view : 'split',
    };
  } catch {
    return { demo: false, beat: null, t: null, plan: null, view: 'split' };
  }
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

/** A script plan name if the file exists, else the fallback. */
const scriptPlan = (name: string, fallback: string): string => (isPlanName(name) ? name : fallback);

/** Everything a beat sets, as data. Pure; exported for tests. */
export function beatConfig(
  beat: Beat,
  cur: { planName: string; plan: StructurePlan; ignition: string; corruption: Corr; seed: number },
): { planName: string; ignition: string; corruption: Corr; caption: string } {
  const { plan, planName, seed } = cur;
  const ignition = sanitizeIgnition(cur.ignition, plan);
  switch (beat) {
    case 'clean': {
      // The script opens on its first plan; the ignition follows the plan when it changes.
      const firstName = scriptPlan(SCRIPT_PLANS.first, planName);
      const first = firstName === planName ? plan : loadPlan(firstName);
      return {
        planName: firstName, ignition: firstName === planName ? ignition : sanitizeIgnition(undefined, first), corruption: { mode: 'none' },
        caption: 'Every sensor is honest. Both brains track the fire; the difference is how each earns its confidence.',
      };
    }
    case 'compare':
      return {
        planName, ignition, corruption: cur.corruption,
        caption: 'Same fire, same broken sensors, each brain now commanding the drones in its own copy of the world. The counter is how many spaces burn; the red one is the Kalman world.',
      };
    case 'casefile': {
      // A documented real fire on its own calibrated plan, with the building's own sensors,
      // which die as the fire reaches them; the 1991 commander's knowledge runs alongside.
      const caseName = scriptPlan(CASEFILE.plan, planName);
      const casePlan = caseName === planName ? plan : loadPlan(caseName);
      return {
        planName: caseName, ignition: sanitizeIgnition(undefined, casePlan), corruption: { mode: 'flashover', onset: 1 },
        caption: `${CASEFILE.name}: the building as built, its sensors dying as the fire reaches them, ${CASEFILE.tickMinutes} minutes a tick. Three beliefs on the same fire: ours, the Kalman baseline, and what the incident commander was actually told, minute by minute, from the report.`,
      };
    }
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
      // The script closes on its last plan; from there (or without it) cycle to the next file.
      const last = scriptPlan(SCRIPT_PLANS.last, planName);
      const nextName = last === planName ? nextPlanName(planName) : last;
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
          : `Same system. Different structure. Nothing retrained. (${nextName}, failure mode ${base.mode}; the structure is a JSON file, the brain is the one that just ran.)`,
      };
    }
  }
}

const saved = load();
const urlPlan = fromUrl().plan;
const initialPlanName: string = urlPlan ?? (saved.planName !== undefined && isPlanName(saved.planName) ? saved.planName : (PLAN_NAMES[0] ?? 'demo-6'));
const initialPlan: StructurePlan = loadPlan(initialPlanName);
const DEFAULT_CORR: Corr = { mode: 'freeze', k: 1, onset: BEAT_ONSET, target: [...initialPlan.ignition] };
const isBrains = (v: unknown): v is Brains => v === 'ours' || v === 'both';

export const useSim = create<SimState>((set, get) => {
  /**
   * Run the current scenario. Shared by run(), runBeat() and runCompare(). With
   * `factories` and `dispatch` given, those override the store's brains and loop mode
   * (the head-to-head). Returns the traces, or null on a validation or runtime error.
   */
  const execute = (opts?: { factories?: Record<string, BrainFactory>; dispatch: boolean }): Record<string, TickRecord[]> | null => {
    const { plan: base, planName, seed, ticks, brains } = get();
    const corruption = sanitizeCorruption(get().corruption, base);
    const ignition = sanitizeIgnition(get().ignition, base);
    if (corruption !== get().corruption || ignition !== get().ignition) set({ corruption, ignition });
    const dispatch = opts?.dispatch ?? get().dispatch;
    save({ planName, seed, ticks, corruption, ignition, brains, dispatch: get().dispatch });
    const why = validateRun(base, ignition, ticks);
    if (why) {
      set({ error: `Cannot run: ${why}`, data: null, trace: null, playing: false, compare: null, closedLoop: false });
      return null;
    }
    // The plan file says where the fire starts; the picker overrides it for demos.
    const plan: StructurePlan = { ...base, ignition: [ignition] };
    try {
      const traces = runLoopMulti({ plan, seed, ticks, corruption, brains: opts?.factories ?? BRAIN_FACTORIES[brains], primary: PRIMARY, dispatch });
      const data = buildViewerData(plan, traces, { seed, corruption });
      if (data.ticks.length === 0) throw new Error('the run produced no ticks');
      const trace = traces[PRIMARY] ?? null;
      // Open two ticks before the failure begins (data.startAt) so the demo starts where it
      // matters, but never past the end of a short run.
      const cursor = Math.max(0, Math.min(data.startAt, (trace?.length ?? 1) - 1));
      set({ traces, data, trace, error: null, cursor, playing: false, compare: null, closedLoop: dispatch });
      return traces;
    } catch (e) {
      set({ error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e), data: null, trace: null, playing: false, compare: null, closedLoop: false });
      return null;
    }
  };
  /**
   * Head to head: the scenario closed-loop with ours driving (that run becomes the main
   * traces), then again with kalman driving. Same seed and config; only `primary` differs.
   * Both brains carry the allocator, so the containment curves compare beliefs, not the
   * presence of a commander.
   */
  const executeCompare = (): void => {
    const ours = execute({ factories: H2H_FACTORIES, dispatch: true });
    if (!ours) return;
    const { plan: base, seed, ticks, ignition, corruption } = get();
    const plan: StructurePlan = { ...base, ignition: [ignition] };
    try {
      const compare: Record<string, TickRecord[]> = { [PRIMARY]: ours[PRIMARY]! };
      for (const primary of Object.keys(H2H_FACTORIES)) {
        if (primary === PRIMARY) continue;
        compare[primary] = runLoopMulti({ plan, seed, ticks, corruption, brains: H2H_FACTORIES, primary, dispatch: true })[primary]!;
      }
      set({ compare });
    } catch (e) {
      set({ error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e), compare: null });
    }
  };
  /** Any manual change means the last beat's caption no longer describes what is shown. */
  const clearBeat = (): { beat: null; caption: '' } => ({ beat: null, caption: '' });
  /**
   * Long runs block the main thread. In a browser, publish `busy` first and start the
   * run on the next macrotask so the page can paint the notice; under node (tests, the
   * CLI) run synchronously so callers can read the state right after the call.
   */
  const withBusy = (label: string | null, work: () => void): void => {
    if (typeof window === 'undefined' || label === null) { work(); return; }
    set({ busy: label });
    setTimeout(() => { try { work(); } finally { set({ busy: null }); } }, 30);
  };
  /** A sentence for the notice, sized to the plan: the incident plan is ~20x the pitch plans. */
  const busyLabel = (what: string, closedLoop: boolean): string | null => {
    const big = get().plan.spaces.length > 40;
    if (!big && !closedLoop) return null; // sub-second: no notice
    return big ? `${what} on the ${get().plan.spaces.length}-space building — ${closedLoop ? 'about a minute' : 'a few seconds'}…` : `${what}…`;
  };
  /** Leaving the case file's run length behind when the demo continues without a beat. */
  const restoreTicks = (): void => {
    const saved = get().ticksBeforeCasefile;
    if (saved !== null && get().planName !== CASEFILE.plan) set({ ticks: saved, ticksBeforeCasefile: null });
  };
  /**
   * Finish the head-to-head beat's caption from what the curves actually show. With the
   * usual onset both brains lock on before the sensor dies and both worlds contain; the
   * caption must not promise a gap that is not there.
   */
  const completeCompareCaption = (): void => {
    const c = get().compare;
    if (!c) return;
    const peak = (t: TickRecord[]) => Math.max(0, ...t.map((r) => r.truth.spaces.filter((x) => x.burning).length));
    const ours = peak(c[PRIMARY] ?? []);
    const worst = Math.max(ours, ...Object.entries(c).filter(([k]) => k !== PRIMARY).map(([, t]) => peak(t)));
    const tail = worst > ours
      ? ` Peak burning: ours ${ours}, the other world ${worst}.`
      : ' Both worlds contain it this time: the sensor died after both brains had locked on. Showdown (blind from tick 1) is where a wrong belief costs the world.';
    set({ caption: get().caption + tail });
  };

  return {
    plan: initialPlan,
    planName: initialPlanName,
    ignition: sanitizeIgnition(saved.ignition, initialPlan),
    seed: typeof saved.seed === 'number' && Number.isFinite(saved.seed) ? Math.round(saved.seed) : 42,
    ticks: typeof saved.ticks === 'number' && Number.isFinite(saved.ticks) && saved.ticks >= 1 ? Math.round(saved.ticks) : 60,
    corruption: sanitizeCorruption(saved.corruption === undefined ? DEFAULT_CORR : coerceCorruption(saved.corruption, DEFAULT_CORR), initialPlan),
    brains: isBrains(saved.brains) ? saved.brains : 'both',
    dispatch: saved.dispatch === true,
    closedLoop: false,
    traces: {},
    primary: PRIMARY,
    data: null,
    trace: null,
    compare: null,
    error: null,
    cursor: 0,
    playing: false,
    speed: 4,
    demo: fromUrl().demo,
    caption: '',
    beat: null,
    view: fromUrl().view,
    ticksBeforeCasefile: null,
    busy: null,
    replay: null,

    run: () => {
      // A manual run is not a beat: the caption would describe a scenario no longer shown.
      if (get().beat !== null || get().caption !== '') set(clearBeat());
      restoreTicks();
      withBusy(busyLabel('Running', get().dispatch), () => execute());
    },
    runBeat: (beat) => withBusy(beat === 'casefile' ? `Replaying the incident: ${CASEFILE_TICKS} ticks, three brains, ${get().plan.spaces.length > 40 ? '' : 'about '}five seconds…` : beat === 'compare' ? busyLabel('Running head to head', true) : null, () => runBeatNow(beat)),
    runCompare: () => withBusy(busyLabel('Running head to head', true), () => runCompareNow()),
    runShowdown: () => withBusy(busyLabel('Running the showdown', true), () => {
      set({ corruption: { mode: 'blind', k: 1, onset: 1, target: [get().ignition] } });
      runCompareNow();
    }),
    setView: (view) => set({ view }),
    loadReplay: (json) => {
      const parsed = parseDemoTrace(json);
      if (!parsed.ok) return parsed.why;
      set({ replay: parsed.trace });
      return null;
    },
    clearReplay: () => set({ replay: null }),

    setPlan: (name) => {
      if (name === get().planName) return;
      const plan = loadPlan(name);
      // A corruption target from the old plan is meaningless here; aim at the new ignition space.
      const corruption = sanitizeCorruption({ ...get().corruption, target: [...plan.ignition] }, plan);
      const ignition = sanitizeIgnition(undefined, plan);
      set({ plan, planName: name, ignition, corruption, traces: {}, data: null, trace: null, compare: null, closedLoop: false, cursor: 0, playing: false, error: null, ...clearBeat() });
      restoreTicks();
    },
    setPlanName: (name) => get().setPlan(name),
    setSeed: (seed) => { if (Number.isFinite(seed)) set({ seed: Math.round(seed), ...clearBeat() }); },
    setIgnition: (ignition) => set({ ignition, ...clearBeat() }),
    setTicks: (ticks) => { if (Number.isFinite(ticks)) set({ ticks: Math.max(1, Math.round(ticks)), ...clearBeat() }); },
    setCorruption: (patch) => set({ corruption: applyCorruptionPatch(get().corruption, patch), ...clearBeat() }),
    setBrains: (brains) => set({ brains, ...clearBeat() }),
    setDispatch: (on) => set({ dispatch: on, ...clearBeat() }),
    setDemo: (on) => set({ demo: on }),

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
  };

  function runBeatNow(beat: Beat): void {
      const { planName, plan, ignition, corruption, seed, view, replay } = get();
      const cfg = beatConfig(beat, { planName, plan, ignition, corruption, seed });
      // The head to head and the case file live on their own pages; every other beat reads best on the split view.
      const nextView: View = beat === 'compare' ? 'h2h' : beat === 'casefile' ? 'casefile' : view === 'h2h' || view === 'casefile' ? 'split' : view;
      set({ planName: cfg.planName, plan: loadPlan(cfg.planName), ignition: cfg.ignition, corruption: cfg.corruption, caption: cfg.caption, beat, view: nextView });
      const recorded = replay?.beats.find((b) => b.beat === beat);
      if (recorded) {
        // Stage backup: show the recorded run for this beat instead of simulating. The
        // parser has already checked the plan and ignition exist in this build.
        const rplan = loadPlan(recorded.planName);
        const traces = recorded.traces;
        const trace = traces[PRIMARY] ?? null;
        const data = buildViewerData({ ...rplan, ignition: [recorded.ignition] }, traces, { seed: recorded.seed, corruption: recorded.corruption });
        set({
          plan: rplan, planName: recorded.planName, ignition: recorded.ignition, corruption: recorded.corruption, seed: recorded.seed, ticks: recorded.ticks, brains: 'both',
          traces, data, trace, compare: recorded.compare ?? null, closedLoop: recorded.closedLoop, error: null, playing: false,
          cursor: Math.max(0, Math.min(data.startAt, (trace?.length ?? 1) - 1)),
          caption: recorded.caption || cfg.caption,
        });
        if (beat === 'compare') completeCompareCaption();
        return;
      }
      if (beat === 'compare') {
        if (get().brains !== 'both') set({ brains: 'both' });
        executeCompare();
        completeCompareCaption();
        return;
      }
      if (beat === 'casefile') {
        // The whole incident, open loop, with the commander baseline alongside the two brains.
        // Its run length is the incident's, not the demo's: remember the demo's to give it back.
        set({ ticks: CASEFILE_TICKS, brains: 'both', ticksBeforeCasefile: get().ticksBeforeCasefile ?? get().ticks });
        execute({ factories: INCIDENT_FACTORIES, dispatch: false });
        return;
      }
      if (get().ticksBeforeCasefile !== null) set({ ticks: get().ticksBeforeCasefile!, ticksBeforeCasefile: null });
      // A beat is always open loop: its caption describes the fire spreading while the
      // brains watch, and a persisted dispatch toggle must not quietly change that.
      execute({ dispatch: false });
  }

  function runCompareNow(): void {
    if (get().brains !== 'both') set({ brains: 'both' });
    if (get().beat !== null || get().caption !== '') set(clearBeat());
    executeCompare();
  }
});
