/**
 * What the scene colors by, as plain data. Three builders, one shape:
 *   truthFrame   colors by true temperature; sensors by what the brain received.
 *   beliefFrame  colors by the brain's estimate; burningSet pulses; ambiguous groups
 *                get a hull; suspect sensors are struck; unsensed spaces are hatched.
 *   diffFrame    colors by |estimate - truth|; outlines where the brain's burning set
 *                disagrees with truth, amber inside an ambiguous group (honest), red outside.
 * The scene never touches TickRecord directly, so the view is a prop, not a rewrite.
 */
import type { TickRecord } from '../../loop';
import type { Belief, SensorId, SpaceId, StructurePlan } from '../../shared/types';

export type SensorStatus = 'ok' | 'dead' | 'lying';
export type SceneView = 'truth' | 'belief' | 'diff';
export type DiffClass = 'ok' | 'warn' | 'wrong' | 'uncertain';

export type SceneFrame = {
  temps: Record<SpaceId, number>;
  burning: Record<SpaceId, boolean>;
  /** Open doors per space, from truth. A door/passage edge is closed when neither side lists the other. */
  doorsOpen: Record<SpaceId, SpaceId[]>;
  sensors: Record<SensorId, SensorStatus>;
  /** Ambiguity groups to hull, one color each. */
  groups?: SpaceId[][];
  /** Sensors the brain distrusts: drawn red with a strike. */
  suspect?: SensorId[];
  /** Spaces the brain has no reading for at all: hatched. */
  unsensed?: SpaceId[];
  /** Per-space outline: 'wrong' red, 'uncertain' amber. */
  outline?: Record<SpaceId, 'wrong' | 'uncertain'>;
  /** Per-space color that replaces the temperature ramp (diff view). */
  colors?: Record<SpaceId, string>;
};

/** A reading further than this from the true temperature is shown as lying. */
export const LYING_THRESHOLD_C = 30;
/** Diff thresholds, degrees C. */
export const DIFF_WARN_C = 20;
export const DIFF_WRONG_C = 80;
export const DIFF_COLORS: Record<DiffClass, string> = { ok: '#22c55e', warn: '#f59e0b', wrong: '#ef4444', uncertain: '#f59e0b' };

export function truthFrame(rec: TickRecord, plan: StructurePlan): SceneFrame {
  const temps: Record<SpaceId, number> = {};
  const burning: Record<SpaceId, boolean> = {};
  const doorsOpen: Record<SpaceId, SpaceId[]> = {};
  for (const s of rec.truth.spaces) {
    temps[s.id] = s.temp;
    burning[s.id] = s.burning;
    doorsOpen[s.id] = s.doorsOpen;
  }
  const seen = new Map(rec.obs.readings.filter((r) => r.source === 'fixed').map((r) => [r.sensorId, r]));
  const sensors: Record<SensorId, SensorStatus> = {};
  for (const f of plan.sensors) {
    const r = seen.get(f.id);
    if (!r) sensors[f.id] = 'dead';
    else if (Math.abs(r.temp - (temps[f.spaceId] ?? r.temp)) > LYING_THRESHOLD_C) sensors[f.id] = 'lying';
    else sensors[f.id] = 'ok';
  }
  return { temps, burning, doorsOpen, sensors };
}

/** Spaces with no reading of any kind this tick, from obs only. */
export function unsensedSpaces(rec: Pick<TickRecord, 'obs'>, plan: StructurePlan): SpaceId[] {
  const heard = new Set(rec.obs.readings.map((r) => r.spaceId));
  return plan.spaces.filter((s) => !heard.has(s.id)).map((s) => s.id);
}

export function beliefFrame(rec: TickRecord, plan: StructurePlan, belief: Belief): SceneFrame {
  const base = truthFrame(rec, plan);
  const temps: Record<SpaceId, number> = {};
  const burning: Record<SpaceId, boolean> = {};
  const inSet = new Set(belief.burningSet);
  for (const s of plan.spaces) {
    temps[s.id] = belief.estimate[s.id] ?? plan.ambient;
    burning[s.id] = inSet.has(s.id);
  }
  return {
    temps,
    burning,
    doorsOpen: base.doorsOpen,
    sensors: base.sensors,
    groups: belief.ambiguous.filter((g) => g.length > 0),
    suspect: [...belief.suspectSensors],
    unsensed: unsensedSpaces(rec, plan),
  };
}

/**
 * How far the brain is from truth on one space. 'uncertain' wins when the space sits in
 * an ambiguous group and the burning verdict disagrees: wrong, and said so. 'wrong' is a
 * burning-set disagreement outside any group, or an error past DIFF_WRONG_C. 'warn' is an
 * error past DIFF_WARN_C. Otherwise 'ok'.
 */
export function diffClass(
  estimate: Record<SpaceId, number>,
  truth: Record<SpaceId, number>,
  burningSet: readonly SpaceId[],
  ambiguous: readonly (readonly SpaceId[])[],
  spaceId: SpaceId,
  truthBurning?: boolean,
): DiffClass {
  const inGroup = ambiguous.some((g) => g.includes(spaceId));
  const believed = burningSet.includes(spaceId);
  if (truthBurning !== undefined && believed !== truthBurning) return inGroup ? 'uncertain' : 'wrong';
  const err = Math.abs((estimate[spaceId] ?? Number.NaN) - (truth[spaceId] ?? Number.NaN));
  if (!Number.isFinite(err)) return inGroup ? 'uncertain' : 'wrong';
  if (err >= DIFF_WRONG_C) return 'wrong';
  if (err >= DIFF_WARN_C) return 'warn';
  return 'ok';
}

export function diffFrame(rec: TickRecord, plan: StructurePlan, belief: Belief): SceneFrame {
  const base = truthFrame(rec, plan);
  const colors: Record<SpaceId, string> = {};
  const outline: Record<SpaceId, 'wrong' | 'uncertain'> = {};
  const temps: Record<SpaceId, number> = {};
  for (const s of plan.spaces) {
    const cls = diffClass(belief.estimate, base.temps, belief.burningSet, belief.ambiguous, s.id, base.burning[s.id]);
    colors[s.id] = DIFF_COLORS[cls];
    temps[s.id] = Math.abs((belief.estimate[s.id] ?? plan.ambient) - (base.temps[s.id] ?? plan.ambient));
    if (cls === 'wrong' && base.burning[s.id] !== belief.burningSet.includes(s.id)) outline[s.id] = 'wrong';
    else if (cls === 'uncertain') outline[s.id] = 'uncertain';
  }
  return { temps, burning: {}, doorsOpen: base.doorsOpen, sensors: base.sensors, colors, outline, groups: belief.ambiguous.filter((g) => g.length > 0) };
}

export function frameFor(view: SceneView, rec: TickRecord, plan: StructurePlan, belief: Belief | undefined): SceneFrame {
  if (view === 'truth' || !belief) return truthFrame(rec, plan);
  return view === 'belief' ? beliefFrame(rec, plan, belief) : diffFrame(rec, plan, belief);
}

export function isDoorOpen(frame: SceneFrame, a: SpaceId, b: SpaceId): boolean {
  return (frame.doorsOpen[a] ?? []).includes(b) || (frame.doorsOpen[b] ?? []).includes(a);
}
