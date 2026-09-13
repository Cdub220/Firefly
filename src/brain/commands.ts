/**
 * src/brain/commands.ts — the UNFROZEN command hook.
 *
 * The method freeze (docs/06-freeze-plan.md section 1) covers the map Observation ->
 * Belief: index.ts, consistency.ts, hypotheses.ts, physics.ts and src/corruption. Drone
 * commands are not part of that map. index.ts calls planCommands() once per tick with
 * everything an allocator could want, and this file is where the checkpoint-4 allocator
 * plugs in (docs/prompts/dean/checkpoint-4.md prompt 1 fills it in and adds allocator.ts)
 * without touching a frozen file.
 *
 * Since CP4 prompt 1 it calls allocate() in allocator.ts. The open-loop family the freeze
 * record's estimator numbers are measured on is produced by a wrapper brain that strips
 * commands (src/eval), not by this hook.
 */
import { allocate } from './allocator';
import type { Belief, Command, Drone, SpaceId, StructurePlan } from '../shared/types';

export type PlanCommandsInput = {
  /** The static structure. Not fire state. */
  plan: StructurePlan;
  /** This tick's belief, as returned to the caller. */
  belief: Belief;
  /**
   * The kept hypothesis sets behind the belief (every surviving explanation of the
   * readings). One set = no ambiguity. Under a total blackout it is the carried-forward
   * burning set alone.
   */
  kept: Set<SpaceId>[];
  /** Drone self-reports as observed this tick (may be stale or missing; never truth). */
  drones: Drone[];
  /** Last tick's commands, for hysteresis. Empty after reset. */
  prev: Command[];
};

/**
 * The allocator hook (CP4 prompt 1): containment value plus information value, greedy
 * with diversity, hysteresis, refills and safety. See allocator.ts.
 */
export function planCommands(input: PlanCommandsInput): Command[] {
  return allocate(input.plan, input.belief, input.kept, input.drones, input.prev);
}
