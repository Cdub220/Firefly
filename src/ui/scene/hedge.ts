/**
 * The checkpoint-4 beat: the brain hedges when it cannot separate spaces and sends
 * different drones to different spaces inside one ambiguous group. Pure.
 */
import type { Belief, Command, DroneId, SpaceId } from '../../shared/types';

export type HedgeInfo = {
  hedging: boolean;
  /** Drones whose commands make up a hedge; their arrows are drawn thick. */
  drones: DroneId[];
  /** The groups (as listed in belief.ambiguous) being covered from two or more sides. */
  groups: SpaceId[][];
};

export function hedgeInfo(belief: Pick<Belief, 'ambiguous'>, commands: readonly Command[]): HedgeInfo {
  const drones = new Set<DroneId>();
  const groups: SpaceId[][] = [];
  for (const g of belief.ambiguous) {
    if (g.length < 2) continue;
    const inGroup = commands.filter((c) => g.includes(c.goTo));
    const targets = new Set(inGroup.map((c) => c.goTo));
    if (targets.size < 2) continue;
    groups.push([...g]);
    for (const c of inGroup) drones.add(c.droneId);
  }
  return { hedging: groups.length > 0, drones: [...drones], groups };
}
