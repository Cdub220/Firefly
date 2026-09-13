import type { Edge, PlanSpace, Space, SpaceId, StructurePlan } from './types';

/** Build live Space records from a plan. Adjacency is derived from edges. */
export function instantiateSpaces(plan: StructurePlan): Space[] {
  const byId = new Map<SpaceId, Space>();
  for (const p of plan.spaces) {
    byId.set(p.id, {
      id: p.id,
      level: p.level,
      neighbors: [],
      above: null,
      below: null,
      temp: p.temp ?? plan.ambient,
      burning: plan.ignition.includes(p.id),
      fuel: p.fuel ?? 1,
      hazard: p.hazard ?? 'none',
      occupants: p.occupants ?? 0,
      doorsOpen: [],
    });
  }
  for (const e of plan.edges) {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b) throw new Error(`plan "${plan.name}": edge references unknown space ${e.a}-${e.b}`);
    if (a.level !== b.level) {
      // Vertical path (a 'floor' edge, or a 'shaft' chain between levels): sets above/below.
      // A floor and a shaft on the same pair agree, so the second write is a no-op.
      const [lower, upper] = a.level < b.level ? [a, b] : [b, a];
      lower.above = upper.id;
      upper.below = lower.id;
    } else {
      if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
      if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
      if (e.kind === 'door' || e.kind === 'passage') {
        if (!a.doorsOpen.includes(b.id)) a.doorsOpen.push(b.id);
        if (!b.doorsOpen.includes(a.id)) b.doorsOpen.push(a.id);
      }
    }
  }
  return plan.spaces.map((p) => byId.get(p.id) as Space);
}

/** Adjacency with rates, in both directions, for anyone doing heat-path reasoning. */
export function edgeMap(plan: StructurePlan): Map<SpaceId, Edge[]> {
  const m = new Map<SpaceId, Edge[]>();
  for (const e of plan.edges) {
    (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e);
    (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push({ ...e, a: e.b, b: e.a });
  }
  return m;
}

export function validatePlan(plan: StructurePlan): void {
  const ids = new Set(plan.spaces.map((s: PlanSpace) => s.id));
  if (ids.size !== plan.spaces.length) throw new Error(`plan "${plan.name}": duplicate space ids`);
  for (const e of plan.edges) {
    if (!ids.has(e.a) || !ids.has(e.b)) throw new Error(`plan "${plan.name}": bad edge ${e.a}-${e.b}`);
    if (e.rate < 0 || e.rate > 1) throw new Error(`plan "${plan.name}": edge rate out of [0,1]`);
  }
  for (const s of plan.sensors) if (!ids.has(s.spaceId)) throw new Error(`plan "${plan.name}": sensor ${s.id} in unknown space`);
  for (const id of [...plan.ignition, ...plan.resupply]) if (!ids.has(id)) throw new Error(`plan "${plan.name}": unknown space ${id}`);
}
