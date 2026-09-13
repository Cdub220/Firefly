/**
 * src/eval — owned by Dean.
 *
 * What a closed-loop run cost, computed from the trace alone (CP4 prompt 3, task B).
 * Pure: a trace and its plan in, an Outcome out. The JSON written by `npm run brief` is
 * a BriefFile (below); Chase's "Commander's brief" panel renders it (CP5).
 */
import type { TickRecord } from '../loop';
import type { Command, DroneClass, DroneId, SensorId, SpaceId, StructurePlan } from '../shared/types';
import { edgeMap } from '../shared/plan';
import { isHedge } from './metrics';

export type OutcomeEventKind =
  | 'ignition'
  | 'sensor-diverges'
  | 'sensor-suspect'
  | 'dispatch'
  | 'hedge'
  | 'drone-death'
  | 'burned-out'
  | 'contained'
  | 'extinguished';

export type OutcomeEvent = { t: number; kind: OutcomeEventKind; text: string };

export type Outcome = {
  /** Space-ticks burning over the run: the area under the burning-count curve. */
  fireVolume: number;
  /** Most spaces burning at once. */
  peakBurning: number;
  /** Spaces whose fuel reached 0 during the run. */
  spacesBurnedOut: SpaceId[];
  /**
   * First tick after which the set of spaces that have EVER burned stops growing for the
   * rest of the run; null if the last ignition is within CONTAINED_MARGIN ticks of the end.
   */
  containedAt: number | null;
  /** First tick with zero burning spaces after the first ignition; null if never. */
  extinguishedAt: number | null;
  /** Per class, drones that received at least one command other than 'hold'. */
  dronesUsed: Partial<Record<DroneClass, DroneId[]>>;
  /** Drone-ticks a tether spent on task 'suppress' in the space it was sent to: the water bill. */
  tetherTicks: number;
  /** Total retardant resource consumed over the run (refills do not subtract). */
  retardantSpent: number;
  /** Per class, drones that died. */
  droneDeaths: Partial<Record<DroneClass, DroneId[]>>;
  /** Commands whose goTo space was, in truth, neither burning nor adjacent to a burning space at that tick. */
  wrongFloor: number;
  /** Ticks where two drones were commanded to different spaces inside one ambiguous group. */
  hedges: number;
  /** One line per event, in tick order. */
  events: OutcomeEvent[];
};

/** The last ignition must be this many ticks before the end for containment to be claimed. */
export const CONTAINED_MARGIN = 10;
/** A reading is "diverging" when it differs from the true temperature by more than this. */
export const DIVERGE_C = 30;
/** A reading is stale when its timestamp lags the observation by this many ticks or more. */
export const STALE_LAG = 1;

const burningIds = (rec: TickRecord): SpaceId[] => rec.truth.spaces.filter((s) => s.burning).map((s) => s.id);

/** Commands that count as "used": everything but hold. */
const isUse = (c: Command): boolean => c.task !== 'hold';

export function computeOutcome(trace: TickRecord[], plan: StructurePlan): Outcome {
  const edges = edgeMap(plan);
  const neighborsOf = (id: SpaceId): SpaceId[] => (edges.get(id) ?? []).map((e) => e.b);
  const events: OutcomeEvent[] = [];
  const classOf = new Map<DroneId, DroneClass>();
  for (const rec of trace) for (const d of rec.truth.drones) if (!classOf.has(d.id)) classOf.set(d.id, d.class);

  let fireVolume = 0;
  let peakBurning = 0;
  const everBurned = new Set<SpaceId>();
  let lastIgnitionAt: number | null = null;
  let firstIgnitionAt: number | null = null;
  let extinguishedAt: number | null = null;
  const burnedOut = new Set<SpaceId>();
  const used = new Map<DroneClass, Set<DroneId>>();
  const deaths = new Map<DroneClass, Set<DroneId>>();
  const dead = new Set<DroneId>();
  let tetherTicks = 0;
  let retardantSpent = 0;
  let wrongFloor = 0;
  let hedges = 0;
  const diverged = new Set<SensorId>();
  const suspected = new Set<SensorId>();
  const lastCmd = new Map<DroneId, Command>();
  let prevResource = new Map<DroneId, number>();
  let prevBurning = new Set<SpaceId>();
  let prevAt = new Map<DroneId, SpaceId>();

  for (const rec of trace) {
    const burning = burningIds(rec);
    const burningSet = new Set(burning);
    fireVolume += burning.length;
    peakBurning = Math.max(peakBurning, burning.length);
    const truthTemp = new Map(rec.truth.spaces.map((s) => [s.id, s.temp]));

    // Ignitions, burn-outs, extinguished.
    for (const id of burning) {
      if (!everBurned.has(id)) {
        everBurned.add(id);
        lastIgnitionAt = rec.t;
        firstIgnitionAt ??= rec.t;
        if (!(rec.t === trace[0]!.t && plan.ignition.includes(id))) events.push({ t: rec.t, kind: 'ignition', text: `${id} ignites` });
        else events.push({ t: rec.t, kind: 'ignition', text: `${id} is burning at the start` });
      }
    }
    for (const s of rec.truth.spaces) {
      if (s.fuel <= 0 && !burnedOut.has(s.id) && everBurned.has(s.id)) {
        burnedOut.add(s.id);
        events.push({ t: rec.t, kind: 'burned-out', text: `${s.id} burns out` });
      }
    }
    if (firstIgnitionAt !== null && extinguishedAt === null && burning.length === 0 && (prevBurning.size > 0 || rec.t > firstIgnitionAt)) {
      extinguishedAt = rec.t;
      events.push({ t: rec.t, kind: 'extinguished', text: `no space burning` });
    }

    // Sensors: a reading first diverging from truth or going stale (the corruptor's doing).
    for (const r of rec.obs.readings) {
      if (diverged.has(r.sensorId)) continue;
      const truth = truthTemp.get(r.spaceId);
      const stale = rec.obs.t - r.t >= STALE_LAG;
      const off = truth !== undefined && Math.abs(r.temp - truth) > DIVERGE_C;
      if (stale || off) {
        diverged.add(r.sensorId);
        const why = stale ? `reads ${(rec.obs.t - r.t)} ticks stale` : `reads ${r.temp.toFixed(0)} C in ${r.spaceId} (truth ${truth!.toFixed(0)})`;
        events.push({ t: rec.t, kind: 'sensor-diverges', text: `sensor ${r.sensorId} ${why}` });
      }
    }
    for (const id of rec.belief.suspectSensors) {
      if (suspected.has(id)) continue;
      suspected.add(id);
      events.push({ t: rec.t, kind: 'sensor-suspect', text: `brain marks ${id} suspect` });
    }

    // Commands: dispatches (a change of goTo or task per drone), wrong floor, hedges.
    const adjacent = new Set<SpaceId>();
    for (const id of burning) for (const n of neighborsOf(id)) adjacent.add(n);
    const atNow = new Map(rec.truth.drones.map((d) => [d.id, d.at]));
    for (const c of rec.commands) {
      const cls = classOf.get(c.droneId);
      if (isUse(c) && cls) (used.get(cls) ?? used.set(cls, new Set()).get(cls)!).add(c.droneId);
      if (isUse(c) && !burningSet.has(c.goTo) && !adjacent.has(c.goTo)) wrongFloor += 1;
      const prev = lastCmd.get(c.droneId);
      if (isUse(c) && (!prev || prev.goTo !== c.goTo || prev.task !== c.task)) {
        const from = atNow.get(c.droneId) ?? prevAt.get(c.droneId) ?? '?'; // where the drone is when the command takes effect
        events.push({ t: rec.t, kind: 'dispatch', text: `${c.droneId} (${cls ?? '?'}) ${from} -> ${c.goTo} ${c.task}` });
      }
      lastCmd.set(c.droneId, c);
    }
    if (rec.belief.ambiguous.length > 0 && isHedge(rec.belief.ambiguous, rec.commands)) {
      hedges += 1;
      const group = rec.belief.ambiguous.find((g) => new Set(rec.commands.filter((c) => g.includes(c.goTo)).map((c) => c.goTo)).size >= 2)!;
      const split = rec.commands.filter((c) => group.includes(c.goTo)).map((c) => `${c.droneId}->${c.goTo}`).join(', ');
      events.push({ t: rec.t, kind: 'hedge', text: `hedge across {${group.join(',')}}: ${split}` });
    }

    // Drones: water bill, retardant spent, deaths.
    for (const d of rec.truth.drones) {
      const cmd = lastCmd.get(d.id);
      if (d.alive && d.class === 'tether' && cmd?.task === 'suppress' && cmd.goTo === d.at) tetherTicks += 1;
      if (d.class === 'retardant') {
        const before = prevResource.get(d.id);
        if (before !== undefined && d.resource < before) retardantSpent += before - d.resource;
      }
      if (!d.alive && !dead.has(d.id)) {
        dead.add(d.id);
        (deaths.get(d.class) ?? deaths.set(d.class, new Set()).get(d.class)!).add(d.id);
        events.push({ t: rec.t, kind: 'drone-death', text: `${d.id} (${d.class}) dies in ${d.at} (${(truthTemp.get(d.at) ?? 0).toFixed(0)} C)` });
      }
    }
    prevResource = new Map(rec.truth.drones.map((d) => [d.id, d.resource]));
    prevAt = atNow;
    prevBurning = burningSet;
  }

  // Containment: the ever-burned set stopped growing early enough before the end.
  const lastT = trace.length ? trace[trace.length - 1]!.t : 0;
  let containedAt: number | null = null;
  if (lastIgnitionAt !== null && lastT - lastIgnitionAt >= CONTAINED_MARGIN) {
    containedAt = lastIgnitionAt;
    events.push({ t: lastIgnitionAt, kind: 'contained', text: `contained: no new space ignites after this (${everBurned.size} ever burned)` });
  }
  events.sort((a, b) => a.t - b.t || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  const toRecord = (m: Map<DroneClass, Set<DroneId>>): Partial<Record<DroneClass, DroneId[]>> =>
    Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));
  return {
    fireVolume,
    peakBurning,
    spacesBurnedOut: [...burnedOut].sort(),
    containedAt,
    extinguishedAt,
    dronesUsed: toRecord(used),
    tetherTicks,
    retardantSpent: Math.round(retardantSpent * 1000) / 1000,
    droneDeaths: toRecord(deaths),
    wrongFloor,
    hedges,
    events,
  };
}

const ORDER: OutcomeEventKind[] = ['ignition', 'sensor-diverges', 'sensor-suspect', 'dispatch', 'hedge', 'drone-death', 'burned-out', 'contained', 'extinguished'];

/** What `npm run brief` writes as JSON: one entry per brain on one (plan, mode, seed). */
export type BriefFile = {
  plan: string;
  mode: string;
  seed: number;
  ticks: number;
  onset: number;
  k: number;
  target: SpaceId[];
  brains: Array<{ name: string; outcome: Outcome; brief: string }>;
};
