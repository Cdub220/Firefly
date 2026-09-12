/**
 * src/world — owned by Chase.
 *
 * Simulation of the structure and the fire. Produces ground truth and clean observations.
 * Must not import src/brain or src/corruption (lint-enforced).
 *
 * Fire physics live in physics.ts (pure, tested in isolation). This file owns the live
 * state, the tick order, and sensing. Drones move wherever they are told; drone effects,
 * death and resupply are TODO(Chase) in drones.ts.
 *
 * The world never lies: readings are true temps plus SENSOR_NOISE_C Gaussian noise.
 */
import { makeRng, type Rng } from '../shared/rng';
import { instantiateSpaces, validatePlan } from '../shared/plan';
import type {
  Command, Drone, Observation, Reading, Space, World, WorldConfig, WorldState,
} from '../shared/types';
import { IGNITION_TEMP, SENSOR_NOISE_C } from './constants';
import { stepPhysics, type Effects } from './physics';

export { constants } from './constants';
export { stepPhysics, effectiveRate, type Effects, type SpaceEffects } from './physics';

const DEFAULT_DRONES: NonNullable<WorldConfig['drones']> = [
  { id: 'D1', class: 'scout', at: '' },
  { id: 'D2', class: 'tether', at: '' },
];

export function createWorld(config: WorldConfig): World {
  validatePlan(config.plan);
  const home = config.plan.resupply[0] ?? config.plan.spaces[0]?.id ?? '';

  let t = 0;
  let spaces: Space[] = [];
  let drones: Drone[] = [];
  let rng: Rng = makeRng(config.seed);

  const reset = (seed: number): void => {
    t = 0;
    rng = makeRng(seed).fork('world');
    spaces = instantiateSpaces(config.plan);
    for (const s of spaces) if (s.burning) s.temp = IGNITION_TEMP;
    drones = (config.drones ?? DEFAULT_DRONES).map((d) => ({
      id: d.id,
      class: d.class,
      at: d.at || home,
      resource: 1,
      alive: true,
      linked: true,
    }));
  };
  reset(config.seed);

  const spaceById = (id: string): Space | undefined => spaces.find((s) => s.id === id);

  const applyCommands = (commands: Command[]): void => {
    for (const c of commands) {
      const d = drones.find((x) => x.id === c.droneId);
      if (!d || !d.alive) continue;
      if (spaceById(c.goTo)) d.at = c.goTo;
    }
  };

  const advancePhysics = (effects: Effects): void => {
    spaces = stepPhysics({ t, spaces, drones }, config.plan, rng, effects).spaces;
  };

  const sense = (): Reading[] => {
    const out: Reading[] = [];
    for (const f of config.plan.sensors) {
      const s = spaceById(f.spaceId);
      if (!s) continue;
      out.push({
        sensorId: f.id,
        source: 'fixed',
        spaceId: s.id,
        temp: s.temp + rng.gauss() * SENSOR_NOISE_C,
        t,
      });
    }
    for (const d of drones) {
      if (!d.alive || !d.linked) continue;
      const s = spaceById(d.at);
      if (!s) continue;
      out.push({
        sensorId: `${d.id}:temp`,
        source: 'drone',
        droneId: d.id,
        spaceId: s.id,
        temp: s.temp + rng.gauss() * SENSOR_NOISE_C,
        t,
      });
    }
    return out;
  };

  const snapshot = (): WorldState => ({
    t,
    spaces: spaces.map((s) => ({ ...s, neighbors: [...s.neighbors], doorsOpen: [...s.doorsOpen] })),
    drones: drones.map((d) => ({ ...d })),
  });

  return {
    tick(commands: Command[]): { truth: WorldState; obs: Observation } {
      applyCommands(commands);
      // TODO(Chase): drones.ts builds the effects map (suppression, coating) in Prompt 2.
      const effects: Effects = {};
      advancePhysics(effects);
      t += 1;
      const truth = snapshot();
      const obs: Observation = {
        t,
        readings: sense(),
        drones: truth.drones.filter((d) => d.linked).map((d) => ({ ...d })),
      };
      return { truth, obs };
    },
    reset,
  };
}
