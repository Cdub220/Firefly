/**
 * Fire physics. Pure functions on WorldState + StructurePlan; no world internals.
 *
 * One call to stepPhysics advances every space by one tick, in this order:
 *   1. heat transfer along plan edges (synchronous, from start-of-tick temps)
 *   2. generation and fuel burn-down in burning spaces (plus drone effects)
 *   3. cooling toward ambient
 *   4. ignition (decided on start-of-tick temps and start-of-tick burning set)
 *   5. ordnance cook-off
 *   6. structural door failure
 *
 * Nothing here names a ship. The plan's edge kinds and rates decide how heat moves.
 */
import type { Rng } from '../shared/rng';
import type { Edge, Space, SpaceId, StructurePlan, WorldState } from '../shared/types';
import {
  BURN, CHEMICAL_COOL_MULT, CLOSED_DOOR_LEAK, COOL, DOOR_FAIL_P, FUEL_HAZARD_MULT, GEN, IGNITE,
  MAX_OUTGOING_RATE, MIN_IGNITION_FUEL, ORDNANCE_COOKOFF_HEAT, ORDNANCE_COOKOFF_TEMP,
  SPONTANEOUS_IGNITE_P,
} from './constants';

/** Per-space drone influence for one tick. Built by drones.ts, consumed here. */
export type SpaceEffects = {
  /** Multiplier on GEN this tick. 1 = no effect. Two tethers give 0.3 * 0.3. */
  suppression: number;
  /** Added to fuel this tick (negative for retardant coating). */
  fuelDelta: number;
};
export type Effects = Partial<Record<SpaceId, SpaceEffects>>;

const NO_EFFECT: SpaceEffects = { suppression: 1, fuelDelta: 0 };

/** Edges as seen from one endpoint. Cached per plan; plans are immutable. */
type Compiled = { out: Map<SpaceId, Edge[]> };
const compiledCache = new WeakMap<StructurePlan, Compiled>();

function compile(plan: StructurePlan): Compiled {
  const hit = compiledCache.get(plan);
  if (hit) return hit;
  const out = new Map<SpaceId, Edge[]>();
  for (const s of plan.spaces) out.set(s.id, []);
  for (const e of plan.edges) {
    out.get(e.a)?.push(e);
    out.get(e.b)?.push({ ...e, a: e.b, b: e.a });
  }
  const c = { out };
  compiledCache.set(plan, c);
  return c;
}

/** The rate an edge actually carries this tick, given door state on both sides. */
export function effectiveRate(edge: Edge, from: Space, to: Space): number {
  if (edge.kind !== 'door' && edge.kind !== 'passage') return edge.rate;
  const open = from.doorsOpen.includes(to.id) || to.doorsOpen.includes(from.id);
  return open ? edge.rate : edge.rate * CLOSED_DOOR_LEAK;
}

function cloneSpace(s: Space): Space {
  return { ...s, neighbors: [...s.neighbors], doorsOpen: [...s.doorsOpen] };
}

export function stepPhysics(
  state: WorldState,
  plan: StructurePlan,
  rng: Rng,
  effects: Effects = {},
): WorldState {
  const { out } = compile(plan);
  const spaces = state.spaces.map(cloneSpace);
  const byId = new Map<SpaceId, Space>(spaces.map((s) => [s.id, s]));

  // Start-of-tick snapshot. Steps 1 and 4 read only these.
  const temp0 = new Map<SpaceId, number>(spaces.map((s) => [s.id, s.temp]));
  const burning0 = new Set<SpaceId>(spaces.filter((s) => s.burning).map((s) => s.id));

  // 1. Heat transfer, synchronous. Per-space outgoing rates clamped to MAX_OUTGOING_RATE.
  for (const s of spaces) {
    const edges = out.get(s.id) ?? [];
    const rates: number[] = [];
    let sum = 0;
    for (const e of edges) {
      const other = byId.get(e.b);
      const r = other ? effectiveRate(e, s, other) : 0;
      rates.push(r);
      sum += r;
    }
    const scale = sum > MAX_OUTGOING_RATE ? MAX_OUTGOING_RATE / sum : 1;
    const tSelf = temp0.get(s.id) ?? s.temp;
    let delta = 0;
    edges.forEach((e, i) => {
      const tOther = temp0.get(e.b);
      if (tOther === undefined) return;
      delta += (rates[i] ?? 0) * scale * (tOther - tSelf);
    });
    s.temp = tSelf + delta;
  }

  // 2. Generation and fuel. Drone effects (suppression, coating) land here.
  for (const s of spaces) {
    const fx = effects[s.id] ?? NO_EFFECT;
    if (fx.fuelDelta !== 0) s.fuel = Math.max(0, Math.min(1, s.fuel + fx.fuelDelta));
    if (!s.burning) continue;
    if (s.fuel <= 0) {
      s.burning = false;
      continue;
    }
    const hazardMult = s.hazard === 'fuel' ? FUEL_HAZARD_MULT : 1;
    s.temp += GEN * hazardMult * fx.suppression;
    s.fuel = Math.max(0, s.fuel - BURN * hazardMult);
    if (s.fuel <= 0) s.burning = false;
  }

  // 3. Cooling toward ambient. Chemical spaces hold heat.
  for (const s of spaces) {
    const cool = s.hazard === 'chemical' ? COOL * CHEMICAL_COOL_MULT : COOL;
    s.temp += cool * (plan.ambient - s.temp);
  }

  // 4. Ignition, on start-of-tick temps and the start-of-tick burning set.
  for (const s of spaces) {
    if (s.burning || s.fuel <= MIN_IGNITION_FUEL) continue;
    const t0 = temp0.get(s.id) ?? s.temp;
    if (t0 < IGNITE) continue;
    const hasBurningNeighbor = (out.get(s.id) ?? []).some((e) => burning0.has(e.b));
    if (hasBurningNeighbor) s.burning = true;
    else if (rng.next() < SPONTANEOUS_IGNITE_P) s.burning = true;
  }

  // 5. Ordnance cook-off: one-shot heat dump into every neighbor.
  for (const s of spaces) {
    if (s.hazard !== 'ordnance' || s.temp < ORDNANCE_COOKOFF_TEMP) continue;
    for (const e of out.get(s.id) ?? []) {
      const n = byId.get(e.b);
      if (n) n.temp += ORDNANCE_COOKOFF_HEAT;
    }
    s.hazard = 'none';
  }

  // 6. Doors: each open door of a burning space may fail shut. Closing removes the pair
  //    from both sides so effectiveRate agrees whichever end asks.
  for (const s of spaces) {
    if (!s.burning) continue;
    for (const nId of [...s.doorsOpen]) {
      if (rng.next() >= DOOR_FAIL_P) continue;
      s.doorsOpen = s.doorsOpen.filter((x) => x !== nId);
      const n = byId.get(nId);
      if (n) n.doorsOpen = n.doorsOpen.filter((x) => x !== s.id);
    }
  }

  return { t: state.t, spaces, drones: state.drones };
}
