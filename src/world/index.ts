/**
 * src/world — owned by Chase.
 *
 * Simulation of the structure and the fire. Produces ground truth and clean observations.
 * Must not import src/brain or src/corruption (lint-enforced).
 *
 * NULL IMPLEMENTATION (v0): spaces come from the plan, temps are constant, the ignition
 * space is hot and burning, drones move wherever they are told. Fixed sensors carry a tiny
 * deterministic noise so the RNG path is exercised. Fire spread, fuel burn-down, vertical
 * conduction and drone effects are TODO(Chase).
 */
import { makeRng, type Rng } from '../shared/rng';
import { instantiateSpaces, validatePlan } from '../shared/plan';
import type {
  Command, Drone, Observation, Reading, Space, World, WorldConfig, WorldState,
} from '../shared/types';

const BURNING_TEMP = 450;
const SENSOR_NOISE_C = 0.5;

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
    for (const s of spaces) if (s.burning) s.temp = BURNING_TEMP;
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

  const advancePhysics = (): void => {
    // TODO(Chase): fire spread along edges by rate, fuel consumption, vertical conduction,
    // drone suppression effects, door state changes, sensor destruction.
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
      advancePhysics();
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
