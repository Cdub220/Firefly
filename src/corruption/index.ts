/**
 * src/corruption — owned by Dean.
 *
 * The failure model, applied between world and brain. The corruptor sees the CLEAN
 * observation (true temps at sensor locations plus tiny noise) and may key failures off
 * those clean temps — a sensor in a 600C space dies — without ever importing src/world.
 *
 * Must not import src/world or src/brain (lint-enforced). The brain must never learn the
 * pattern applied here except through the observations themselves.
 *
 * Modes:
 *   none:      identity.
 *   freeze:    at onset, up to k sensors stick at their last value; `t` stops advancing.
 *   blind:     at onset, up to k sensors report ambient-ish regardless of truth (smoke
 *              blinds the thermal camera exactly where it is hottest), with a current `t`.
 *   saturate:  every sensor whose clean temp exceeds saturateAt pins at exactly
 *              saturateAt. No k limit: this is physics, it hits every hot sensor.
 *   flashover: a space whose clean temp exceeds flashoverTemp loses EVERY sensor in it,
 *              permanently, and drones caught in it report alive:false, linked:false.
 *              The correlated failure. Not bounded by k.
 *   mixed:     freeze + blind (sharing the k budget) + saturate + flashover, plus a 0.02
 *              per-tick per-drone chance of comms loss (that tick's readings and
 *              self-report dropped).
 *
 * Corrupted sensor identity persists across ticks (once frozen, stays frozen); per-sensor
 * state lives in closures below and reset(seed) clears it. Every draw goes through
 * makeRng(seed).fork('corruption'), and sensor selection is a deterministic function of
 * the seed (candidates are sorted by sensorId before shuffling, so it does not depend on
 * reading order).
 */
import { makeRng, type Rng } from '../shared/rng';
import type {
  CorruptionConfig, Corruptor, Drone, DroneId, Observation, Reading, SensorId, SpaceId,
} from '../shared/types';

/** Defaults for every optional CorruptionConfig field. `target` omitted = anywhere. */
export const DEFAULT_CORRUPTION = {
  k: 2,
  onset: 5,
  flashoverTemp: 500,
  saturateAt: 300,
  ambient: 20,
} as const;

const COMMS_LOSS_P = 0.02; // mixed mode: per tick, per drone
const BLIND_NOISE_C = 1; // sigma of the "ambient-ish" reading

type StuckKind = 'freeze' | 'blind';

export function createCorruptor(config: CorruptionConfig): Corruptor {
  const k = config.k ?? DEFAULT_CORRUPTION.k;
  const onset = config.onset ?? DEFAULT_CORRUPTION.onset;
  const flashoverTemp = config.flashoverTemp ?? DEFAULT_CORRUPTION.flashoverTemp;
  const saturateAt = config.saturateAt ?? DEFAULT_CORRUPTION.saturateAt;
  const ambient = config.ambient ?? DEFAULT_CORRUPTION.ambient;

  const wantFreeze = config.mode === 'freeze' || config.mode === 'mixed';
  const wantBlind = config.mode === 'blind' || config.mode === 'mixed';
  const wantSaturate = config.mode === 'saturate' || config.mode === 'mixed';
  const wantFlashover = config.mode === 'flashover' || config.mode === 'mixed';
  const wantCommsLoss = config.mode === 'mixed';

  let rng: Rng = makeRng(config.seed).fork('corruption');
  // Per-sensor state. Once corrupted, stays corrupted. reset(seed) clears everything.
  let stuck = new Map<SensorId, StuckKind>(); // chosen at onset, fixed thereafter
  let frozenReadings = new Map<SensorId, Reading>(); // value captured at the freeze tick
  let frozenDrones = new Map<DroneId, Drone>(); // self-report captured at the freeze tick
  let flashedSpaces = new Set<SpaceId>(); // destroyed spaces; readings from them vanish
  let deadDrones = new Set<DroneId>(); // drones caught in a flashover
  let selectionDone = false;

  const inTarget = (spaceId: SpaceId): boolean =>
    config.target === undefined || config.target.includes(spaceId);

  /** At the first tick >= onset with candidates, pick up to k sensors and their fate. */
  const selectStuckSensors = (obs: Observation): void => {
    if (selectionDone || (!wantFreeze && !wantBlind) || obs.t < onset) return;
    const candidates = obs.readings
      .filter((r) => inTarget(r.spaceId) && !flashedSpaces.has(r.spaceId))
      .map((r) => r.sensorId)
      .sort();
    if (candidates.length === 0) return; // try again next tick
    const chosen = rng.shuffle(candidates).slice(0, Math.min(k, candidates.length));
    for (const id of chosen) {
      const kind: StuckKind =
        wantFreeze && wantBlind ? (rng.next() < 0.5 ? 'freeze' : 'blind') : wantFreeze ? 'freeze' : 'blind';
      stuck.set(id, kind);
    }
    selectionDone = true;
  };

  /** Spaces whose clean temp crosses flashoverTemp lose every sensor in them, for good. */
  const updateFlashovers = (obs: Observation): void => {
    if (!wantFlashover) return;
    const hottest = new Map<SpaceId, number>();
    for (const r of obs.readings) {
      hottest.set(r.spaceId, Math.max(hottest.get(r.spaceId) ?? -Infinity, r.temp));
    }
    for (const [spaceId, temp] of hottest) {
      if (temp > flashoverTemp && inTarget(spaceId) && !flashedSpaces.has(spaceId)) {
        flashedSpaces.add(spaceId);
        for (const d of obs.drones) if (d.at === spaceId) deadDrones.add(d.id);
      }
    }
  };

  return {
    apply(obs: Observation): Observation {
      if (config.mode === 'none') return obs;

      // Flashovers first: sensors destroyed this very tick are not freeze/blind candidates,
      // so the k budget is never spent on a sensor that will produce no output.
      updateFlashovers(obs);
      selectStuckSensors(obs);

      // Mixed mode comms loss: that drone contributes nothing at all this tick.
      const commsLost = new Set<DroneId>();
      if (wantCommsLoss) {
        for (const d of obs.drones) if (rng.next() < COMMS_LOSS_P) commsLost.add(d.id);
      }

      const readings: Reading[] = [];
      for (const r of obs.readings) {
        if (flashedSpaces.has(r.spaceId)) continue; // the space is gone
        if (r.droneId !== undefined && (deadDrones.has(r.droneId) || commsLost.has(r.droneId))) continue;
        const kind = stuck.get(r.sensorId);
        if (kind === 'freeze') {
          let held = frozenReadings.get(r.sensorId);
          if (held === undefined) {
            // The tick it froze: hold what the sensor was REPORTING, not the clean temp —
            // in mixed mode a sensor hotter than saturateAt was pinned, and freezing the
            // clean value would leak a temperature the hardware could never emit.
            const temp = wantSaturate && r.temp > saturateAt ? saturateAt : r.temp;
            held = { ...r, temp };
            frozenReadings.set(r.sensorId, held);
          }
          readings.push({ ...held });
        } else if (kind === 'blind') {
          readings.push({ ...r, temp: ambient + rng.gauss() * BLIND_NOISE_C });
        } else if (wantSaturate && r.temp > saturateAt && inTarget(r.spaceId)) {
          readings.push({ ...r, temp: saturateAt });
        } else {
          readings.push({ ...r });
        }
      }

      const drones: Drone[] = [];
      for (const d of obs.drones) {
        if (commsLost.has(d.id)) continue; // nothing arrives this tick
        if (deadDrones.has(d.id)) {
          drones.push({ ...d, alive: false, linked: false });
          continue;
        }
        if (stuck.get(`${d.id}:temp`) === 'freeze') {
          let held = frozenDrones.get(d.id);
          if (held === undefined) {
            held = { ...d }; // same at, same resource, forever
            frozenDrones.set(d.id, held);
          }
          drones.push({ ...held });
          continue;
        }
        drones.push({ ...d });
      }

      return { t: obs.t, readings, drones };
    },
    reset(seed: number): void {
      rng = makeRng(seed).fork('corruption');
      stuck = new Map();
      frozenReadings = new Map();
      frozenDrones = new Map();
      flashedSpaces = new Set();
      deadDrones = new Set();
      selectionDone = false;
    },
  };
}
