/**
 * Shape the loop's traces into the compact record the split view renders.
 * Used by the browser UI (src/ui/split) and the standalone exporter (npm run viewer).
 */
import type { TickRecord } from '../loop';
import type { Belief, CorruptionConfig, Edge, FixedSensor, SpaceId, StructurePlan } from '../shared/types';

export type ViewerBelief = {
  estimate: Record<SpaceId, number>;
  burningSet: SpaceId[];
  ambiguous: SpaceId[][];
  suspectSensors: string[];
  confidence: number;
  /** Per-space P(burning) if the brain provides one (additive; absent on older brains). */
  probability?: Record<SpaceId, number>;
};
export type ViewerTick = {
  t: number;
  truth: Record<SpaceId, { temp: number; burning: boolean; fuel: number }>;
  readings: Array<{ sensorId: string; source: string; spaceId: SpaceId; temp: number; t: number }>;
  brains: Record<string, ViewerBelief>;
};
export type ViewerData = {
  plan: { name: string; spaces: Array<{ id: SpaceId }>; edges: Edge[]; sensors: FixedSensor[] };
  ambient: number;
  seed: number;
  corruption: Omit<CorruptionConfig, 'seed'>;
  onset: number | null;
  startAt: number;
  brainNames: string[];
  ticks: ViewerTick[];
};

const r1 = (v: number): number => Math.round(v * 10) / 10;

function pickBelief(b: Belief & { probability?: Record<SpaceId, number> }): ViewerBelief {
  const out: ViewerBelief = {
    estimate: Object.fromEntries(Object.entries(b.estimate).map(([id, v]) => [id, r1(v)])),
    burningSet: b.burningSet,
    ambiguous: b.ambiguous,
    suspectSensors: b.suspectSensors,
    confidence: Math.round(b.confidence * 100) / 100,
  };
  if (b.probability) out.probability = Object.fromEntries(Object.entries(b.probability).map(([id, v]) => [id, Math.round(v * 100) / 100]));
  return out;
}

export function buildViewerData(
  plan: StructurePlan,
  traces: Record<string, TickRecord[]>,
  cfg: { seed: number; corruption: Omit<CorruptionConfig, 'seed'> },
): ViewerData {
  const names = Object.keys(traces);
  const first = traces[names[0]!]!;
  const onset = cfg.corruption.mode === 'none' ? null : (cfg.corruption.onset ?? 5);
  return {
    plan: { name: plan.name, spaces: plan.spaces.map((s) => ({ id: s.id })), edges: plan.edges, sensors: plan.sensors },
    ambient: plan.ambient,
    seed: cfg.seed,
    corruption: cfg.corruption,
    onset,
    startAt: Math.max(0, (onset ?? 2) - 2),
    brainNames: names,
    ticks: first.map((r, i) => ({
      t: r.t,
      truth: Object.fromEntries(r.truth.spaces.map((s) => [s.id, { temp: r1(s.temp), burning: s.burning, fuel: Math.round(s.fuel * 100) / 100 }])),
      readings: r.obs.readings.map((x) => ({ sensorId: x.sensorId, source: x.source, spaceId: x.spaceId, temp: r1(x.temp), t: x.t })),
      brains: Object.fromEntries(names.map((n) => [n, pickBelief(traces[n]![i]!.belief)])),
    })),
  };
}
