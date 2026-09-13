/**
 * What the scene colors by, as plain data. `truthFrame` reads a tick's ground truth; a
 * `beliefFrame(rec, brainName)` for checkpoint 4 is the same shape from a belief. The
 * scene never touches TickRecord directly, so swapping the source is a prop, not a rewrite.
 */
import type { TickRecord } from '../../loop';
import type { SensorId, SpaceId, StructurePlan } from '../../shared/types';

export type SensorStatus = 'ok' | 'dead' | 'lying';

export type SceneFrame = {
  temps: Record<SpaceId, number>;
  burning: Record<SpaceId, boolean>;
  /** Open doors per space, from truth. A door/passage edge is closed when neither side lists the other. */
  doorsOpen: Record<SpaceId, SpaceId[]>;
  sensors: Record<SensorId, SensorStatus>;
};

/** A reading further than this from the true temperature is shown as lying. */
export const LYING_THRESHOLD_C = 30;

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

export function isDoorOpen(frame: SceneFrame, a: SpaceId, b: SpaceId): boolean {
  return (frame.doorsOpen[a] ?? []).includes(b) || (frame.doorsOpen[b] ?? []).includes(a);
}
