/**
 * Drone behaviour: movement, physical effects, resupply, death. Called from index.ts
 * before physics each tick. Physics stays pure: this module produces an Effects map and
 * edits doors directly (the world owns doors).
 *
 * The world owns what a drone physically does and whether it survives. Whether the brain
 * hears from it (Drone.linked, stale self-reports) is Dean's corruptor.
 */
import type { Command, Drone, Space, SpaceId, StructurePlan } from '../shared/types';
import { COAT_RATE, DRONE_DEATH, DRONE_DEATH_TETHER, TETHER_COOL, TETHER_SUPPRESSION } from './constants';
import type { Effects, SpaceEffects } from './physics';

/** What a drone is currently trying to do. Persists across ticks until a new command. */
export type Assignment = { goTo: SpaceId; task: string };

/** Temperature at which this class dies. */
export function deathTemp(d: Pick<Drone, 'class'>): number {
  return d.class === 'tether' ? DRONE_DEATH_TETHER : DRONE_DEATH;
}

/** Adjacency over every plan edge, all kinds traversable, door state ignored. Cached per plan. */
const adjCache = new WeakMap<StructurePlan, Map<SpaceId, SpaceId[]>>();
export function adjacency(plan: StructurePlan): Map<SpaceId, SpaceId[]> {
  const hit = adjCache.get(plan);
  if (hit) return hit;
  const m = new Map<SpaceId, SpaceId[]>();
  for (const s of plan.spaces) m.set(s.id, []);
  for (const e of plan.edges) {
    if (e.a === e.b) continue;
    const a = m.get(e.a);
    const b = m.get(e.b);
    if (!a || !b) continue;
    if (!a.includes(e.b)) a.push(e.b);
    if (!b.includes(e.a)) b.push(e.a);
  }
  adjCache.set(plan, m);
  return m;
}

/**
 * Shortest path from `from` to `to` (inclusive of both) by BFS. `blocked` spaces are not
 * entered except as the destination. Returns null when unreachable.
 */
export function bfsPath(
  plan: StructurePlan,
  from: SpaceId,
  to: SpaceId,
  blocked: (id: SpaceId) => boolean = () => false,
): SpaceId[] | null {
  if (from === to) return [from];
  const adj = adjacency(plan);
  const prev = new Map<SpaceId, SpaceId>();
  const seen = new Set<SpaceId>([from]);
  const queue: SpaceId[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of adj.get(cur) ?? []) {
      if (seen.has(n)) continue;
      if (n !== to && blocked(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path: SpaceId[] = [to];
        let p: SpaceId | undefined = to;
        while ((p = prev.get(p)) !== undefined) path.unshift(p);
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** Record new commands. A command for a dead or unknown drone, or an unknown space, is ignored. */
export function applyCommands(
  commands: Command[],
  drones: Drone[],
  spaceIds: Set<SpaceId>,
  assignments: Map<string, Assignment>,
): void {
  for (const c of commands) {
    const d = drones.find((x) => x.id === c.droneId);
    if (!d || !d.alive || !spaceIds.has(c.goTo)) continue;
    assignments.set(d.id, { goTo: c.goTo, task: c.task });
  }
}

/**
 * Move every live drone one edge toward its goal. A drone routes around spaces that would
 * kill it when a safe route exists; otherwise it takes the shortest route and stops one
 * edge short of a lethal space and waits. Drone.at is always a space, never a midpoint.
 */
export function moveDrones(
  drones: Drone[],
  spaces: Space[],
  plan: StructurePlan,
  assignments: Map<string, Assignment>,
): void {
  const tempOf = new Map<SpaceId, number>(spaces.map((s) => [s.id, s.temp]));
  for (const d of drones) {
    if (!d.alive) continue;
    const a = assignments.get(d.id);
    if (!a || a.goTo === d.at) continue;
    const lethal = (id: SpaceId): boolean => (tempOf.get(id) ?? 0) >= deathTemp(d);
    const path = bfsPath(plan, d.at, a.goTo, lethal) ?? bfsPath(plan, d.at, a.goTo);
    const next = path?.[1];
    if (next === undefined || lethal(next)) continue; // unreachable, or wait one edge short
    d.at = next;
  }
}

/**
 * Physical effects of every live drone that is in its goal space. Builds the Effects map
 * for physics, spends resource, closes doors, refills. Called after movement, so a drone
 * acts on the tick it arrives.
 */
export function applyEffects(
  drones: Drone[],
  spaces: Space[],
  plan: StructurePlan,
  assignments: Map<string, Assignment>,
): Effects {
  const effects: Effects = {};
  const byId = new Map<SpaceId, Space>(spaces.map((s) => [s.id, s]));
  const fx = (id: SpaceId): SpaceEffects =>
    (effects[id] ??= { suppression: 1, fuelDelta: 0, cooling: 0 });

  for (const d of drones) {
    if (!d.alive) continue;
    const a = assignments.get(d.id);
    if (!a || a.goTo !== d.at) continue;
    const here = byId.get(d.at);
    if (!here) continue;
    switch (a.task) {
      case 'suppress': {
        if (d.class !== 'tether') break;
        const e = fx(here.id);
        e.suppression *= TETHER_SUPPRESSION;
        e.cooling = (e.cooling ?? 0) + TETHER_COOL;
        d.resource = 1;
        break;
      }
      case 'coat': {
        if (d.class !== 'retardant' || d.resource <= 0) break;
        const amount = Math.min(COAT_RATE, d.resource);
        fx(here.id).fuelDelta -= amount;
        d.resource = Math.max(0, d.resource - amount);
        break;
      }
      case 'close-door': {
        if (d.class !== 'hatch') break;
        for (const nId of here.doorsOpen) {
          const n = byId.get(nId);
          if (n) n.doorsOpen = n.doorsOpen.filter((x) => x !== here.id);
        }
        here.doorsOpen = [];
        break;
      }
      case 'refill': {
        if (plan.resupply.includes(here.id)) d.resource = 1;
        break;
      }
      default:
        // observe, hold, anything else: the drone is a sensor by being there.
        break;
    }
  }
  return effects;
}

/** End of tick: a drone in a space at or above its death temperature dies. */
export function killDrones(drones: Drone[], spaces: Space[]): void {
  const tempOf = new Map<SpaceId, number>(spaces.map((s) => [s.id, s.temp]));
  for (const d of drones) {
    if (!d.alive) continue;
    if ((tempOf.get(d.at) ?? 0) >= deathTemp(d)) d.alive = false;
  }
}
