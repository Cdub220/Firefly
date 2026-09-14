/**
 * Generic multi-storey plan generator driven entirely by a spec file: a run of floors,
 * a set of named zones repeated on every floor, same-level edges between zones,
 * vertical edges per zone column, and any extra edges or per-floor overrides the source
 * material calls for. Nothing here knows which building it is; the spec does.
 *
 *   npx tsx src/world/gen-highrise.ts <spec.json> <out-dir>
 *
 * writes `<out-dir>/plan.json` (sensors as the spec's `asBuilt` list) and
 * `<out-dir>/plan.instrumented.json` (one sensor in every space). A test pins the
 * committed files to the generator's output, so hand-edit the spec, not the plans.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePlan } from '../shared/plan';
import type { Edge, EdgeKind, FixedSensor, Hazard, PlanSpace, SpaceId, StructurePlan } from '../shared/types';

export type HighriseZone = { id: string; label?: string; fuel?: number; hazard?: Hazard; occupants?: number };
export type HighriseSpec = {
  name: string;
  ambient: number;
  floors: { from: number; to: number };
  zones: HighriseZone[];
  /** Repeated on every floor, between zone ids. */
  sameLevelEdges: Array<{ a: string; b: string; kind: EdgeKind; rate: number; note?: string }>;
  /** One per zone column, between floor n and n+1. 'floor' edges define above/below. */
  verticalEdges: Array<{ zone: string; kind: EdgeKind; rate: number; note?: string }>;
  /** Fully qualified space ids, for one-off paths (an open stair between two floors). */
  extraEdges?: Array<{ a: SpaceId; b: SpaceId; kind: EdgeKind; rate: number; note?: string }>;
  /** Per-floor overrides applied to every zone on that floor (a sprinklered floor's fuel). */
  floorOverrides?: Record<string, { fuel?: number; hazard?: Hazard; note?: string }>;
  sensors: { asBuilt: string[]; instrumented: 'all' | string[] };
  ignition: SpaceId[];
  resupply: SpaceId[];
};

export const spaceId = (floor: number, zone: string): SpaceId => `L${floor}-${zone}`;

function makePlan(spec: HighriseSpec, sensorZones: readonly string[] | 'all', name: string): StructurePlan {
  const floors: number[] = [];
  for (let f = spec.floors.from; f <= spec.floors.to; f++) floors.push(f);
  const zoneIds = spec.zones.map((z) => z.id);
  const known = new Set(zoneIds);
  for (const e of spec.sameLevelEdges) for (const z of [e.a, e.b]) if (!known.has(z)) throw new Error(`spec "${spec.name}": same-level edge names unknown zone ${z}`);
  for (const v of spec.verticalEdges) if (!known.has(v.zone)) throw new Error(`spec "${spec.name}": vertical edge names unknown zone ${v.zone}`);

  const spaces: PlanSpace[] = [];
  for (const f of floors) {
    const over = spec.floorOverrides?.[String(f)];
    for (const z of spec.zones) {
      const s: PlanSpace = { id: spaceId(f, z.id), level: f };
      const fuel = over?.fuel ?? z.fuel;
      const hazard = over?.hazard ?? z.hazard;
      if (fuel !== undefined) s.fuel = fuel;
      if (hazard !== undefined) s.hazard = hazard;
      if (z.occupants !== undefined) s.occupants = z.occupants;
      spaces.push(s);
    }
  }
  const edges: Edge[] = [];
  for (const f of floors) for (const e of spec.sameLevelEdges) edges.push({ a: spaceId(f, e.a), b: spaceId(f, e.b), kind: e.kind, rate: e.rate });
  for (let i = 0; i + 1 < floors.length; i++) {
    for (const v of spec.verticalEdges) edges.push({ a: spaceId(floors[i]!, v.zone), b: spaceId(floors[i + 1]!, v.zone), kind: v.kind, rate: v.rate });
  }
  for (const e of spec.extraEdges ?? []) edges.push({ a: e.a, b: e.b, kind: e.kind, rate: e.rate });

  const sensors: FixedSensor[] = [];
  for (const f of floors) {
    for (const z of spec.zones) {
      if (sensorZones !== 'all' && !sensorZones.includes(z.id)) continue;
      sensors.push({ id: `F-${spaceId(f, z.id)}`, spaceId: spaceId(f, z.id) });
    }
  }
  const plan: StructurePlan = { name, ambient: spec.ambient, spaces, edges, sensors, resupply: [...spec.resupply], ignition: [...spec.ignition] };
  validatePlan(plan);
  return plan;
}

export function makeHighrisePlans(spec: HighriseSpec): { asBuilt: StructurePlan; instrumented: StructurePlan } {
  return {
    asBuilt: makePlan(spec, spec.sensors.asBuilt, spec.name),
    instrumented: makePlan(spec, spec.sensors.instrumented, `${spec.name}-instrumented`),
  };
}

export const planText = (plan: StructurePlan): string => `${JSON.stringify(plan, null, 2)}\n`;

const isMain = typeof process !== 'undefined' && process.argv?.[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const [specPath, outDir] = process.argv.slice(2);
  if (!specPath || !outDir) throw new Error('usage: gen-highrise <spec.json> <out-dir>');
  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as HighriseSpec;
  const { asBuilt, instrumented } = makeHighrisePlans(spec);
  mkdirSync(outDir, { recursive: true });
  for (const [file, plan] of [['plan.json', asBuilt], ['plan.instrumented.json', instrumented]] as const) {
    const path = resolve(outDir, file);
    writeFileSync(path, planText(plan));
    console.log(`wrote ${path}  spaces=${plan.spaces.length} edges=${plan.edges.length} sensors=${plan.sensors.length}`);
  }
}
