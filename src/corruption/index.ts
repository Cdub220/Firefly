/**
 * src/corruption — owned by Dean.
 *
 * Applied between world and brain. This is where the failure model lives: smoke-blinded
 * sensors reading cold, heat-saturated sensors, frozen/stale readings after comms loss,
 * and correlated death of every sensor in a space that flashes over.
 *
 * Must not import src/world or src/brain (lint-enforced). The brain must never learn the
 * pattern applied here except through the observations themselves.
 *
 * NULL IMPLEMENTATION (v0): identity passthrough.
 */
import { makeRng, type Rng } from '../shared/rng';
import type { CorruptionConfig, Corruptor, Observation } from '../shared/types';

export function createCorruptor(config: CorruptionConfig): Corruptor {
  let rng: Rng = makeRng(config.seed).fork('corruption');
  void rng; // reserved for the real failure model. TODO(Dean).
  return {
    apply(obs: Observation): Observation {
      switch (config.mode) {
        case 'none':
          return obs;
      }
    },
    reset(seed: number): void {
      rng = makeRng(seed).fork('corruption');
    },
  };
}
