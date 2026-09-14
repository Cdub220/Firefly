/**
 * The 1991 incident commander as a Brain: at minute m it believes exactly the floors the
 * report says the command post had been told were burning (windows, crews, the guard),
 * at the confidence a commander acts on. It reads NO sensor; its belief is a function of
 * time only, taken from the incident record. It issues no commands of its own; wrap it in
 * Dean's `withAllocator` to ask "what if that knowledge had driven the drones".
 *
 * This is the human baseline of docs/10-incident-replay-plan.md step 4. It is not a
 * caricature: it knows the fire floor 8 minutes after detection, which is exactly what
 * the record says, and everything after that comes from the same record.
 */
import type { BrainFactory } from '../loop';
import type { Belief, StructurePlan } from '../shared/types';
import { floorOf, TICK_MINUTES, zoneOf } from './calibration';

export type KnowledgeStage = { minute: number; floors: number[]; confidence: number; why?: string };

/** The zones a commander's "floor X is burning" maps to: the perimeter offices where fire shows at the windows. */
export const OFFICE_ZONES: readonly string[] = ['A1', 'A2', 'A3', 'A4'];

/** The stage in force at `minute`: the last one whose minute is <= it (stages must be sorted). */
export function stageAt(stages: readonly KnowledgeStage[], minute: number): KnowledgeStage {
  let cur: KnowledgeStage = { minute: 0, floors: [], confidence: 0 };
  for (const s of stages) { if (s.minute <= minute) cur = s; else break; }
  return cur;
}

/** The belief a commander with `stage` holds about `plan`, as the contract wants it. */
export function commanderBelief(plan: StructurePlan, stage: KnowledgeStage, hot = 700): Belief {
  const known = new Set(stage.floors);
  const burningSet = plan.spaces.filter((s) => known.has(floorOf(s.id)) && OFFICE_ZONES.includes(zoneOf(s.id))).map((s) => s.id);
  const inSet = new Set(burningSet);
  const estimate: Record<string, number> = {};
  const probability: Record<string, number> = {};
  for (const s of plan.spaces) {
    estimate[s.id] = inSet.has(s.id) ? hot : plan.ambient;
    probability[s.id] = inSet.has(s.id) ? stage.confidence : 0;
  }
  return { estimate, burningSet, ambiguous: [], suspectSensors: [], confidence: burningSet.length ? stage.confidence : stage.confidence, probability };
}

/** A brain factory from a knowledge schedule (minutes) and the tick length. */
export function createCommander(stages: readonly KnowledgeStage[], tickMinutes = TICK_MINUTES): BrainFactory {
  const sorted = [...stages].sort((a, b) => a.minute - b.minute);
  return (cfg) => ({
    step: (obs) => ({ belief: commanderBelief(cfg.plan, stageAt(sorted, obs.t * tickMinutes)), commands: [] }),
    reset: () => {},
  });
}
