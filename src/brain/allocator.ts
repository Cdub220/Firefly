/**
 * src/brain/allocator.ts — the allocator (CP4 prompt 1). New code in a new file; reads a
 * Belief and the kept hypotheses, never truth. Called from the unfrozen hook in commands.ts.
 *
 * Every drone is both a suppression asset and a sensor, so a placement is scored by
 * CONTAINMENT value (what the drone's class does where the fire is believed to be) plus
 * INFORMATION value (how much a trusted reading there would shrink the set of surviving
 * hypotheses), minus travel. Assignment is greedy with diversity: once a space is taken,
 * its information value drops to 0.3x and its containment to 0.6x for the remaining
 * drones, which is what makes the allocator SPLIT units across an ambiguous pair instead
 * of piling onto one. Hysteresis keeps a drone on its previous target unless a new one is
 * clearly better, so drones do not oscillate between near-equal choices.
 *
 * What the allocator knows about drones comes from obs.drones self-reports (possibly
 * stale, possibly missing); it never assumes a command was obeyed.
 */
import { edgeMap } from '../shared/plan';
import { steadyState } from './physics';
import type { Belief, Command, Drone, DroneClass, Hazard, SpaceId, StructurePlan } from '../shared/types';

export const W_CONTAINMENT = 1;
export const W_INFO_SENSOR = 2; // scout, relay
export const W_INFO_OTHER = 0.7;
export const W_DISTANCE = 0.05;
export const DIVERSITY_INFO = 0.3; // a second sensor in the same space is worth less
export const DIVERSITY_CONTAINMENT = 0.6;
export const HYSTERESIS = 0.15; // keep the previous target if within 15% of the best
export const REFILL_BELOW = 0.15; // retardant resource below this: go refill
export const SAFE_TEMP = 400; // non-tether drones never sent above this estimate (they die at 400)
/**
 * A tether is water-cooled and dies only at flame temperature (900 C, the world's
 * DRONE_DEATH_TETHER, see docs/decisions.md Sat hour 6); a burning space plateaus near
 * 770 C. The prompt's 600 C was written against the earlier 500 C tether death and would
 * forbid engaging any established fire, which is the one job a tether has. 100 C under
 * the death temperature, as the prompt's 400 C is for free-flyers' 400 C.
 */
export const SAFE_TEMP_TETHER = 800;
export const HOT_C = 200; // "hot" for the information bucket
const HAZARD_WEIGHT: Record<Hazard, number> = { none: 0, ordnance: 3, fuel: 2, chemical: 2 };

export const TASK_BY_CLASS: Record<DroneClass, string> = {
  tether: 'suppress',
  retardant: 'coat',
  scout: 'observe',
  relay: 'observe',
  hatch: 'close-door',
};

/** BFS hop counts from `from` over every plan edge (any kind), door state ignored. */
export function pathLengths(plan: StructurePlan, from: SpaceId): Map<SpaceId, number> {
  const edges = edgeMap(plan);
  const dist = new Map<SpaceId, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges.get(cur) ?? []) {
      if (!dist.has(e.b)) {
        dist.set(e.b, dist.get(cur)! + 1);
        queue.push(e.b);
      }
    }
  }
  return dist;
}

export type AllocatorOptions = {
  /**
   * Spaces that have a trusted reading this tick from something other than the drones
   * being allocated, so a sensor there adds no information. Default: spaces with a fixed
   * sensor not in belief.suspectSensors. Drones are added per drone: another drone's
   * space is sensed; a drone's OWN space is not sensed for it, so staying where it is
   * keeps whatever information it is providing (otherwise it would leave and come back).
   */
  sensed?: Set<SpaceId>;
};

/** Per-space scores for one belief: containment by class and information. Exported for tests and the hedge printout. */
export function scoreSpaces(
  plan: StructurePlan,
  belief: Belief,
  hypotheses: Set<SpaceId>[],
  sensed: Set<SpaceId>,
): { candidates: SpaceId[]; pBurning: Map<SpaceId, number>; containment: Map<SpaceId, Record<DroneClass, number>>; information: Map<SpaceId, number> } {
  const edges = edgeMap(plan);
  const neighborsOf = (id: SpaceId): SpaceId[] => (edges.get(id) ?? []).map((e) => e.b);
  const byId = new Map(plan.spaces.map((s) => [s.id, s]));
  const kept = hypotheses.length > 0 ? hypotheses : [new Set(belief.burningSet)];
  const burning = new Set(belief.burningSet);

  // P(s burning) = fraction of kept hypotheses containing s; 1.0 for the reported set.
  const pBurning = new Map<SpaceId, number>();
  for (const s of plan.spaces) {
    if (burning.has(s.id)) pBurning.set(s.id, 1);
    else pBurning.set(s.id, kept.filter((h) => h.has(s.id)).length / kept.length);
  }

  // Candidates: believed burning, ambiguous, and anything adjacent to either.
  const core = new Set<SpaceId>([...belief.burningSet, ...belief.ambiguous.flat()]);
  const candidates = new Set<SpaceId>(core);
  for (const id of core) for (const n of neighborsOf(id)) candidates.add(n);

  const containment = new Map<SpaceId, Record<DroneClass, number>>();
  const information = new Map<SpaceId, number>();
  for (const id of candidates) {
    const space = byId.get(id);
    if (!space) continue;
    const p = pBurning.get(id) ?? 0;
    const hz = HAZARD_WEIGHT[space.hazard ?? 'none'];
    // P(adjacent to burning AND not burning): over hypotheses.
    const pFront = kept.filter((h) => !h.has(id) && neighborsOf(id).some((n) => h.has(n))).length / kept.length;
    const fuel = space.fuel ?? 1;
    const openDoorsToUnburned = (edges.get(id) ?? []).filter(
      (e) => (e.kind === 'door' || e.kind === 'passage') && !burning.has(e.b),
    ).length;
    containment.set(id, {
      tether: p * (1 + 0.5 * (space.occupants ?? 0) + hz),
      retardant: pFront * fuel * (1 + hz),
      hatch: p * openDoorsToUnburned,
      scout: 0,
      relay: 0,
    });
    // Information: expected shrink of the hypothesis set if a trusted reading at id arrived.
    // The map holds the value for an UNSENSED space; allocate() zeroes it per drone where
    // a fixed sensor or another drone already reads.
    if (sensed.has(id) || kept.length < 2) {
      information.set(id, 0);
    } else {
      let hot = 0;
      for (const h of kept) if ((steadyState(plan, h)[id] ?? plan.ambient) > HOT_C) hot += 1;
      const larger = Math.max(hot, kept.length - hot);
      information.set(id, 1 - larger / kept.length);
    }
  }
  return { candidates: [...candidates].sort(), pBurning, containment, information };
}

export function allocate(
  plan: StructurePlan,
  belief: Belief,
  hypotheses: Set<SpaceId>[],
  drones: Drone[],
  prevCommands: Command[],
  opts: AllocatorOptions = {},
): Command[] {
  const byId = new Map(plan.spaces.map((s) => [s.id, s]));
  const active = drones.filter((d) => d.alive && d.linked && byId.has(d.at));
  if (active.length === 0) return [];

  const suspect = new Set(belief.suspectSensors);
  const sensedFixed = opts.sensed ?? new Set<SpaceId>(plan.sensors.filter((f) => !suspect.has(f.id)).map((f) => f.spaceId));
  const { candidates, containment, information } = scoreSpaces(plan, belief, hypotheses, sensedFixed);
  // Drones that are reading now (alive, linked, not suspect), by space.
  const droneReaders = new Map<SpaceId, number>();
  for (const d of active) if (!suspect.has(`${d.id}:temp`)) droneReaders.set(d.at, (droneReaders.get(d.at) ?? 0) + 1);
  const sensedFor = (d: Drone, id: SpaceId): boolean =>
    sensedFixed.has(id) || (droneReaders.get(id) ?? 0) - (d.at === id && !suspect.has(`${d.id}:temp`) ? 1 : 0) > 0;
  const prevById = new Map(prevCommands.map((c) => [c.droneId, c]));
  const estimate = (id: SpaceId): number => belief.estimate[id] ?? plan.ambient;

  // Safety: a free-flying drone dies above SAFE_TEMP. The estimate of a believed-burning
  // space can lag (its sensor is often the one that died), so burningSet itself is unsafe
  // for non-tethers regardless of the number; ambiguous spaces are judged by estimate.
  // The rule governs SENDING a drone somewhere; a drone already in a space may act there
  // (a tether standing in the fire it was sent to keeps suppressing rather than holding).
  const burningNow = new Set(belief.burningSet);
  const safeFor = (d: Drone, id: SpaceId): boolean =>
    id === d.at || (d.class === 'tether' ? estimate(id) <= SAFE_TEMP_TETHER : estimate(id) <= SAFE_TEMP && !burningNow.has(id));

  const out: Command[] = [];
  const pending: Drone[] = [];
  // Resource first: an empty retardant goes to the nearest resupply, whatever the fire does.
  for (const d of active) {
    if (d.class === 'retardant' && d.resource < REFILL_BELOW && plan.resupply.length > 0) {
      const dist = pathLengths(plan, d.at);
      // Nearest resupply that is safe to enter (a burning resupply space is no refill point).
      const target = [...plan.resupply]
        .filter((r) => byId.has(r) && safeFor(d, r))
        .sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity) || a.localeCompare(b))[0];
      if (target !== undefined) {
        out.push({ droneId: d.id, goTo: target, task: 'refill' });
        continue;
      }
    }
    pending.push(d);
  }

  // Working copies of the per-space values, decayed as spaces are taken (diversity).
  const infoNow = new Map(information);
  const contNow = new Map([...containment].map(([id, c]) => [id, { ...c }]));
  const distByDrone = new Map(pending.map((d) => [d.id, pathLengths(plan, d.at)]));
  const wInfo = (d: Drone): number => (d.class === 'scout' || d.class === 'relay' ? W_INFO_SENSOR : W_INFO_OTHER);
  const score = (d: Drone, id: SpaceId): number => {
    const dist = distByDrone.get(d.id)!.get(id);
    if (dist === undefined) return -Infinity; // unreachable
    const info = sensedFor(d, id) ? 0 : (infoNow.get(id) ?? 0);
    return W_CONTAINMENT * (contNow.get(id)?.[d.class] ?? 0) + wInfo(d) * info - W_DISTANCE * dist;
  };

  const remaining = new Set(pending.map((d) => d.id));
  const droneById = new Map(pending.map((d) => [d.id, d]));
  while (remaining.size > 0) {
    // Highest-scoring (drone, space) pair among the unassigned drones. Ties: shorter path,
    // then drone id, then space id, so the result is deterministic.
    let best: { d: Drone; id: SpaceId; s: number } | null = null;
    for (const dId of remaining) {
      const d = droneById.get(dId)!;
      for (const id of candidates) {
        if (!safeFor(d, id)) continue;
        const s = score(d, id);
        if (s === -Infinity) continue;
        if (
          best === null ||
          s > best.s + 1e-12 ||
          (Math.abs(s - best.s) <= 1e-12 &&
            ((distByDrone.get(d.id)!.get(id) ?? Infinity) < (distByDrone.get(best.d.id)!.get(best.id) ?? Infinity) ||
              ((distByDrone.get(d.id)!.get(id) ?? Infinity) === (distByDrone.get(best.d.id)!.get(best.id) ?? Infinity) &&
                (d.id < best.d.id || (d.id === best.d.id && id < best.id)))))
        ) {
          best = { d, id, s };
        }
      }
    }
    if (best === null || best.s <= 0) {
      // Nothing worth doing for anyone left: hold position.
      for (const dId of [...remaining].sort()) {
        const d = droneById.get(dId)!;
        out.push({ droneId: d.id, goTo: d.at, task: 'hold' });
      }
      break;
    }
    const { d } = best;
    let target = best.id;
    const task = TASK_BY_CLASS[d.class]; // the class decides the task; a previous command never carries a foreign one
    // Hysteresis: stay on the previous target if it is still within 15% of the best.
    const prev = prevById.get(d.id);
    if (prev && prev.task !== 'refill' && prev.task !== 'hold' && prev.goTo !== target && candidates.includes(prev.goTo) && safeFor(d, prev.goTo)) {
      const sPrev = score(d, prev.goTo);
      if (sPrev > 0 && sPrev >= best.s * (1 - HYSTERESIS)) target = prev.goTo;
    }
    out.push({ droneId: d.id, goTo: target, task });
    remaining.delete(d.id);
    // Diversity: the taken space is worth less to everyone still unassigned.
    infoNow.set(target, (infoNow.get(target) ?? 0) * DIVERSITY_INFO);
    const c = contNow.get(target);
    if (c) for (const k of Object.keys(c) as DroneClass[]) c[k] *= DIVERSITY_CONTAINMENT;
  }
  return out.sort((a, b) => a.droneId.localeCompare(b.droneId));
}
