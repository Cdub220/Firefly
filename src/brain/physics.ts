/**
 * The brain's model of the structure's heat physics — its trusted reference. When a
 * sensor contradicts conservation of heat along the plan's edges, the sensor is lying;
 * the steel is not.
 *
 * The constants below are ASSUMED PROPERTIES OF THE STRUCTURE (how fast fires here
 * generate heat, what temperature they plateau at, how the structure sheds heat). They are
 * copied, not imported, from the world's tuning: the brain models the building, it does
 * not read the simulator, and a small mismatch with the real sim is realistic.
 */
import { edgeMap } from '../shared/plan';
import type { SpaceId, StructurePlan } from '../shared/types';

export const GEN_RATE = 0.25; // fraction of (FLAME_TEMP - T) a burning space closes per tick
export const FLAME_TEMP = 900; // temperature a compartment fire plateaus near
export const COOL = 0.02; // fraction of (ambient - T) every space loses per tick
export const IGNITE = 250; // unburned space with fuel can ignite at or above this
export const FUEL_HAZARD_MULT = 1.5; // 'fuel' hazard spaces generate heat (and burn fuel) this much faster
export const BURN = 0.02; // fraction of a space's fuel load a fire consumes per tick

/**
 * How many ticks a space can sustain a fire on a full fuel load, by hazard. The brain
 * cannot see fuel; it assumes the structure's nominal load and burn rate.
 */
export function fuelTicks(plan: StructurePlan, spaceId: SpaceId): number {
  const hazard = plan.spaces.find((s) => s.id === spaceId)?.hazard ?? 'none';
  return 1 / (BURN * (hazard === 'fuel' ? FUEL_HAZARD_MULT : 1));
}
export const ORDNANCE_COOKOFF_HEAT = 150; // one-off jump a neighbor of 'ordnance' can see
export const TETHER_COOL = 0.1; // extra cooling per tether working a space
export const MAX_TETHERS = 2; // most units that plausibly work one space at once
/**
 * A tether on 'suppress' multiplies a burning space's heat generation by this, per tether
 * (two stack to 0.09). Mirror of the world's TETHER_SUPPRESSION (src/world/constants.ts),
 * copied, not imported, like the constants above: the brain models what water does.
 */
export const TETHER_SUPPRESSION = 0.3;
export const SIGMA_C = 2; // sensor noise the brain assumes (conservative)

const STEADY_EPS_C = 0.5;
const MAX_OUTGOING_RATE = 0.9; // stability clamp on a space's summed edge rates (as the world)

/**
 * One tick of the linear heat model: transfer along edges, generation, ambient loss, and
 * suppression. `suppression` maps a space to the number of tethers working it (capped at
 * MAX_TETHERS): a burning space generates TETHER_SUPPRESSION ** n of its heat and every
 * space with tethers loses n * TETHER_COOL * (T - ambient) more per tick, exactly the
 * world's effect of a tether on 'suppress'. No map = no suppression = the old behaviour.
 */
export function forward(
  plan: StructurePlan,
  temps: Record<SpaceId, number>,
  burning: Set<SpaceId>,
  suppression?: ReadonlyMap<SpaceId, number>,
): Record<SpaceId, number> {
  const edges = edgeMap(plan);
  const hazard = new Map(plan.spaces.map((s) => [s.id, s.hazard ?? 'none']));
  const out: Record<SpaceId, number> = {};
  for (const s of plan.spaces) {
    const t = temps[s.id] ?? plan.ambient;
    let dT = COOL * (plan.ambient - t);
    const myEdges = edges.get(s.id) ?? [];
    const rateSum = myEdges.reduce((a, e) => a + e.rate, 0);
    const scale = rateSum > MAX_OUTGOING_RATE ? MAX_OUTGOING_RATE / rateSum : 1;
    for (const e of myEdges) {
      dT += scale * e.rate * ((temps[e.b] ?? plan.ambient) - t);
    }
    const tethers = Math.min(MAX_TETHERS, Math.max(0, suppression?.get(s.id) ?? 0));
    if (tethers > 0) dT += tethers * TETHER_COOL * (plan.ambient - t);
    if (burning.has(s.id)) {
      const gen = hazard.get(s.id) === 'fuel' ? GEN_RATE * FUEL_HAZARD_MULT : GEN_RATE;
      dT += gen * Math.pow(TETHER_SUPPRESSION, tethers) * (FLAME_TEMP - t);
    }
    out[s.id] = t + dT;
  }
  return out;
}

/** Where the structure settles if `burning` burns indefinitely. Cached per burning set. */
const steadyCache = new WeakMap<StructurePlan, Map<string, Record<SpaceId, number>>>();

export function steadyState(
  plan: StructurePlan,
  burning: Set<SpaceId>,
  iters = 200,
): Record<SpaceId, number> {
  const key = [...burning].sort().join(',');
  let byKey = steadyCache.get(plan);
  if (byKey === undefined) {
    byKey = new Map();
    steadyCache.set(plan, byKey);
  }
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;

  let temps: Record<SpaceId, number> = {};
  for (const s of plan.spaces) temps[s.id] = plan.ambient;
  for (let i = 0; i < iters; i++) {
    const next = forward(plan, temps, burning);
    let maxChange = 0;
    for (const s of plan.spaces) maxChange = Math.max(maxChange, Math.abs(next[s.id]! - temps[s.id]!));
    temps = next;
    if (maxChange < STEADY_EPS_C) break;
  }
  Object.freeze(temps); // callers share the cached object; mutation would poison it
  byKey.set(key, temps);
  return temps;
}

/**
 * The largest one-tick temperature increase physically possible in a space, given its
 * neighbors' current estimated temps: inflow from every hotter neighbor, plus full
 * generation as if it were burning (with its hazard multiplier), plus the one-off
 * cook-off jump if any neighbor holds ordnance. A reported rise beyond this is a lie.
 */
export function maxRise(plan: StructurePlan, spaceId: SpaceId, temps: Record<SpaceId, number>): number {
  const t = temps[spaceId] ?? plan.ambient;
  const space = plan.spaces.find((s) => s.id === spaceId);
  let rise = 0;
  let cookoff = 0;
  for (const e of edgeMap(plan).get(spaceId) ?? []) {
    rise += e.rate * Math.max(0, (temps[e.b] ?? plan.ambient) - t);
    // Every ordnance neighbor could cook off in the same tick; allow one jump per each.
    if (plan.spaces.find((s) => s.id === e.b)?.hazard === 'ordnance') cookoff += ORDNANCE_COOKOFF_HEAT;
  }
  const gen = space?.hazard === 'fuel' ? GEN_RATE * FUEL_HAZARD_MULT : GEN_RATE;
  rise += gen * Math.max(0, FLAME_TEMP - t);
  return rise + cookoff;
}

/**
 * The largest one-tick temperature DROP physically possible in a space: outflow to every
 * cooler neighbor, ambient loss, and the most aggressive suppression imaginable (two
 * tethers cooling at once). A reported drop beyond this — a 450C compartment "reading
 * ambient" one tick later — is a lie, and it is exactly how smoke-blinding presents.
 */
export function maxDrop(plan: StructurePlan, spaceId: SpaceId, temps: Record<SpaceId, number>): number {
  const t = temps[spaceId] ?? plan.ambient;
  let drop = (COOL + MAX_TETHERS * TETHER_COOL) * Math.max(0, t - plan.ambient);
  for (const e of edgeMap(plan).get(spaceId) ?? []) {
    drop += e.rate * Math.max(0, t - (temps[e.b] ?? plan.ambient));
  }
  return drop;
}
