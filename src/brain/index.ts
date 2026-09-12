/**
 * src/brain — owned by Dean.
 *
 * Estimation and allocation. Sees ONLY Observation objects. Never truth, never the
 * corruption pattern. Enforced by lint: this directory cannot import src/world,
 * src/corruption, src/eval, src/ui or src/loop.
 *
 * NULL IMPLEMENTATION (v0): estimate = last reading per space; burningSet = anything
 * over BURN_THRESHOLD; no ambiguity detection; confidence 1; no commands.
 */
import { makeRng, type Rng } from '../shared/rng';
import type { Belief, Brain, BrainConfig, Command, Observation, SpaceId } from '../shared/types';

const BURN_THRESHOLD_C = 200;

export function createBrain(config: BrainConfig): Brain {
  let rng: Rng = makeRng(config.seed).fork('brain');
  void rng; // reserved for hedging / tie-breaks. TODO(Dean).
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      const estimate: Record<SpaceId, number> = {};
      for (const id of spaceIds) estimate[id] = config.plan.ambient;
      // Latest reading per space wins. Fixed sensors and drones are trusted equally in v0.
      const latest = new Map<SpaceId, number>();
      for (const r of obs.readings) {
        const prev = latest.get(r.spaceId);
        if (prev === undefined || r.t >= prev) {
          latest.set(r.spaceId, r.t);
          estimate[r.spaceId] = r.temp;
        }
      }
      const burningSet = spaceIds.filter((id) => (estimate[id] ?? 0) > BURN_THRESHOLD_C);
      const belief: Belief = {
        estimate,
        burningSet,
        ambiguous: [],
        suspectSensors: [],
        confidence: 1,
      };
      const commands: Command[] = [];
      return { belief, commands };
    },
    reset(): void {
      rng = makeRng(config.seed).fork('brain');
    },
  };
}
