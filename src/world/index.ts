/**
 * src/world — owned by Chase.
 *
 * Simulation of the structure and the fire. Produces ground truth and clean observations.
 * Must not import src/brain or src/corruption (lint-enforced).
 *
 * Fire physics live in physics.ts (pure: returns a new state). Drone behaviour lives in
 * drones.ts (edits the drones and doors it is handed in place, and builds the Effects map
 * physics consumes). This file owns the live state, the tick order, and sensing.
 *
 * Tick order: commands -> drones move -> drone effects -> physics -> drones die -> sense.
 *
 * The world never lies: readings are true temps plus SENSOR_NOISE_C Gaussian noise, and
 * obs.drones is every live drone's true state. Comms loss is Dean's corruptor.
 */
import { makeRng, type Rng } from '../shared/rng';
import { instantiateSpaces, validatePlan } from '../shared/plan';
import type {
  Command, Drone, Observation, Reading, Space, World, WorldConfig, WorldState,
} from '../shared/types';
import { IGNITION_TEMP, SENSOR_NOISE_C } from './constants';
import { stepPhysics } from './physics';
import { applyCommands, applyEffects, killDrones, moveDrones, type Assignment } from './drones';

export { constants } from './constants';
export { stepPhysics, effectiveRate, type Effects, type SpaceEffects } from './physics';
export { bfsPath, deathTemp } from './drones';

/** Two scouts, two tethers, one retardant, one hatch, all at the first resupply space. */
export const DEFAULT_DRONES: NonNullable<WorldConfig['drones']> = [
  { id: 'D1', class: 'scout', at: '' },
  { id: 'D2', class: 'scout', at: '' },
  { id: 'D3', class: 'tether', at: '' },
  { id: 'D4', class: 'tether', at: '' },
  { id: 'D5', class: 'retardant', at: '' },
  { id: 'D6', class: 'hatch', at: '' },
];

export function createWorld(config: WorldConfig): World {
  validatePlan(config.plan);
  const home = config.plan.resupply[0] ?? config.plan.spaces[0]?.id ?? '';
  const spaceIds = new Set(config.plan.spaces.map((s) => s.id));

  let t = 0;
  let spaces: Space[] = [];
  let drones: Drone[] = [];
  let assignments = new Map<string, Assignment>();
  let rng: Rng = makeRng(config.seed);

  const reset = (seed: number): void => {
    t = 0;
    rng = makeRng(seed).fork('world');
    spaces = instantiateSpaces(config.plan);
    for (const s of spaces) if (s.burning) s.temp = IGNITION_TEMP;
    drones = (config.drones ?? DEFAULT_DRONES).map((d) => ({
      id: d.id,
      class: d.class,
      at: spaceIds.has(d.at) ? d.at : home,
      resource: 1,
      alive: true,
      linked: true,
    }));
    assignments = new Map();
  };
  reset(config.seed);

  const spaceById = (id: string): Space | undefined => spaces.find((s) => s.id === id);

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
      if (!d.alive) continue;
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
      applyCommands(commands, drones, spaceIds, assignments);
      moveDrones(drones, spaces, config.plan, assignments);
      const effects = applyEffects(drones, spaces, config.plan, assignments);
      spaces = stepPhysics({ t, spaces, drones }, config.plan, rng, effects).spaces;
      killDrones(drones, spaces);
      t += 1;
      const truth = snapshot();
      const obs: Observation = {
        t,
        readings: sense(),
        drones: truth.drones.filter((d) => d.alive).map((d) => ({ ...d })),
      };
      return { truth, obs };
    },
    reset,
  };
}
