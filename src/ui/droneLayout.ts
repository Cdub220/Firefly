/**
 * Pure helpers for drawing drones: ring offsets so several drones in one space do not
 * overlap, per-class styling, task colours, nearest resupply (for a tether's hose), and
 * the side-panel rows that compare truth against the brain's self-reports. No three.js.
 */
import type { TickRecord } from '../loop';
import type { Command, Drone, DroneClass, DroneId, SpaceId, StructurePlan } from '../shared/types';

/** Radius of the ring drones sit on, above a space. */
export const RING_RADIUS = 0.62;
/** Height of a drone above the top face of its box. */
export const DRONE_LIFT = 1.15;

/**
 * n distinct (dx, dz) offsets on a ring, deterministic in n and i. A single drone sits at
 * the centre; more spread evenly, starting at +x.
 */
export function ringOffsets(n: number, radius = RING_RADIUS): Array<{ dx: number; dz: number }> {
  if (n <= 0) return [];
  if (n === 1) return [{ dx: 0, dz: 0 }];
  const out: Array<{ dx: number; dz: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push({ dx: round3(radius * Math.cos(a)), dz: round3(radius * Math.sin(a)) });
  }
  return out;
}
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Which slot each drone occupies in its space, so the same drone keeps its slot as others come and go. */
export function slotsBySpace(drones: readonly Pick<Drone, 'id' | 'at' | 'alive'>[]): Map<DroneId, { index: number; count: number }> {
  const bySpace = new Map<SpaceId, DroneId[]>();
  for (const d of [...drones].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    (bySpace.get(d.at) ?? bySpace.set(d.at, []).get(d.at)!).push(d.id);
  }
  const out = new Map<DroneId, { index: number; count: number }>();
  for (const ids of bySpace.values()) ids.forEach((id, index) => out.set(id, { index, count: ids.length }));
  return out;
}

export type DroneStyle = { shape: 'cylinder' | 'tetra' | 'sphere' | 'cube'; color: string; label: string };
export const DRONE_STYLE: Record<DroneClass, DroneStyle> = {
  tether: { shape: 'cylinder', color: '#22d3ee', label: 'tether' },
  retardant: { shape: 'tetra', color: '#22c55e', label: 'retardant' },
  scout: { shape: 'sphere', color: '#f5f5f5', label: 'scout' },
  relay: { shape: 'sphere', color: '#facc15', label: 'relay' },
  hatch: { shape: 'cube', color: '#fb923c', label: 'hatch' },
};

export const TASK_COLORS: Record<string, string> = {
  suppress: '#22d3ee',
  coat: '#22c55e',
  observe: '#f5f5f5',
  'close-door': '#fb923c',
  refill: '#facc15',
  hold: '#6b7280',
};
export const taskColor = (task: string): string => TASK_COLORS[task] ?? '#a78bfa';

/** BFS over plan edges; the nearest resupply space to `from` by hop count, or undefined. */
export function nearestResupply(plan: StructurePlan, from: SpaceId): SpaceId | undefined {
  if (plan.resupply.length === 0) return undefined;
  if (plan.resupply.includes(from)) return from;
  const adj = new Map<SpaceId, SpaceId[]>();
  for (const e of plan.edges) {
    if (e.a === e.b) continue;
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
  }
  const seen = new Set<SpaceId>([from]);
  let frontier: SpaceId[] = [from];
  while (frontier.length > 0) {
    const next: SpaceId[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (seen.has(n)) continue;
        if (plan.resupply.includes(n)) return n;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return plan.resupply[0];
}

export type DroneRow = {
  id: DroneId;
  class: DroneClass;
  at: SpaceId;
  /** Where the brain thinks it is, from obs.drones; undefined if the brain heard nothing. */
  seenAt: SpaceId | undefined;
  goTo: SpaceId | undefined;
  task: string | undefined;
  resource: number;
  alive: boolean;
  /** The brain's view differs from truth (stale or missing self-report). Dead drones are never stale. */
  stale: boolean;
  arrived: boolean;
};

/** One row per truth drone: truth, what the brain saw, and the brain's command for it. */
export function droneRows(rec: Pick<TickRecord, 'truth' | 'obs' | 'commands'>): DroneRow[] {
  const seen = new Map(rec.obs.drones.map((d) => [d.id, d]));
  const cmd = new Map<DroneId, Command>();
  for (const c of rec.commands) cmd.set(c.droneId, c); // last command per drone wins
  return rec.truth.drones.map((d) => {
    const s = seen.get(d.id);
    const c = cmd.get(d.id);
    const stale = d.alive && (s === undefined || s.at !== d.at || s.resource !== d.resource || s.alive !== d.alive);
    return {
      id: d.id, class: d.class, at: d.at, seenAt: s?.at, goTo: c?.goTo, task: c?.task,
      resource: d.resource, alive: d.alive, stale, arrived: c !== undefined && c.goTo === d.at,
    };
  });
}
