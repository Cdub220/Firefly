/**
 * "Break it" presets and the sensor readout. Pure functions over the plan, the store's
 * corruption config and the trace. No truth is read: the hottest-neighbor preset uses
 * observed readings, and the readout compares obs against the plan's sensor list.
 */
import type { TickRecord } from '../../loop';
import type { Observation, SpaceId, StructurePlan } from '../../shared/types';
import type { Corr } from '../store';

export type Preset = { id: string; label: string; help: string; corruption: Corr };

/** Same-level and vertical neighbours of a space, in plan edge order. */
export function neighborsOf(plan: StructurePlan, id: SpaceId): SpaceId[] {
  const out: SpaceId[] = [];
  for (const e of plan.edges) {
    if (e.a === id && e.b !== id && !out.includes(e.b)) out.push(e.b);
    else if (e.b === id && e.a !== id && !out.includes(e.a)) out.push(e.a);
  }
  return out;
}

/**
 * The neighbour of `ignition` with the highest observed reading at `onset` in the trace,
 * or the first neighbour when there is no trace yet. Uses obs, never truth.
 */
export function hottestNeighbor(plan: StructurePlan, ignition: SpaceId, trace: TickRecord[] | null, onset: number): SpaceId | undefined {
  const nbs = neighborsOf(plan, ignition);
  if (nbs.length === 0) return undefined;
  const rec = trace && trace.length > 0 ? trace[Math.max(0, Math.min(trace.length - 1, onset - 1))] : undefined;
  if (!rec) return nbs[0];
  let best: SpaceId | undefined;
  let bestTemp = -Infinity;
  for (const r of rec.obs.readings) {
    if (!nbs.includes(r.spaceId)) continue;
    if (r.temp > bestTemp) { bestTemp = r.temp; best = r.spaceId; }
  }
  return best ?? nbs[0];
}

export function presetsFor(plan: StructurePlan, ignition: SpaceId, trace: TickRecord[] | null, current: Corr): Preset[] {
  const onset = current.onset ?? 5;
  const keep = { onset, ...(current.flashoverTemp !== undefined ? { flashoverTemp: current.flashoverTemp } : {}), ...(current.saturateAt !== undefined ? { saturateAt: current.saturateAt } : {}) };
  const hot = hottestNeighbor(plan, ignition, trace, onset);
  // No `target` key at all means "any sensor". To the corruptor an empty array means "no
  // sensor qualifies", which would make a preset do nothing, so it is never emitted.
  return [
    { id: 'freeze-ignition', label: 'freeze the ignition sensor', help: `Sensor in ${ignition} keeps reporting its last value.`, corruption: { ...keep, mode: 'freeze', k: 1, target: [ignition] } },
    { id: 'blind-neighbor', label: 'blind the hottest neighbor', help: hot ? `Sensor in ${hot} reads room temperature.` : 'No neighbour: blinds any one sensor.', corruption: { ...keep, mode: 'blind', k: 1, ...(hot ? { target: [hot] } : {}) } },
    { id: 'flashover', label: 'flashover', help: 'Every sensor in any space past the flashover temperature dies.', corruption: { ...keep, mode: 'flashover', k: 1 } },
    { id: 'everything', label: 'everything', help: 'Freeze, blind, saturate, flashover and comms loss, three at a time, anywhere.', corruption: { ...keep, mode: 'mixed', k: 3 } },
  ];
}

export type SensorReadout = { present: number; total: number; missing: string[] };

/** Fixed sensors the plan has versus fixed readings the brain got this tick. Obs only. */
export function sensorReadout(plan: StructurePlan, obs: Observation | undefined): SensorReadout {
  const total = plan.sensors.length;
  if (!obs) return { present: 0, total, missing: plan.sensors.map((s) => s.id) };
  const seen = new Set(obs.readings.filter((r) => r.source === 'fixed').map((r) => r.sensorId));
  const missing = plan.sensors.filter((s) => !seen.has(s.id)).map((s) => s.id);
  return { present: total - missing.length, total, missing };
}
