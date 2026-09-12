/**
 * THE CONTRACT.
 *
 * Nobody edits this file without both owners (Dean, Chase) agreeing.
 *
 * Everything here is structure-agnostic. A ship, a high-rise, a warehouse and a data
 * center are all a StructurePlan: levels, spaces, edges with heat-transfer rates, fixed
 * sensors. Nothing in this file, or anywhere in src/, may name a ship.
 *
 * Data flow, one tick:
 *
 *   World.tick(commands) -> { truth, obs }
 *   Corruptor.apply(obs) -> obs'            (readings and drone self-reports, damaged)
 *   Brain.step(obs')     -> { belief, commands }
 *
 * The Brain never sees `truth`. That is enforced by lint (src/brain cannot import
 * src/world or src/corruption) and by the Brain interface only accepting Observation.
 */

export type SpaceId = string;
export type SensorId = string;
export type DroneId = string;

export type Hazard = 'none' | 'ordnance' | 'fuel' | 'chemical';

/** Live state of one space (room, compartment, bay, storey section). */
export type Space = {
  id: SpaceId;
  level: number;
  neighbors: SpaceId[]; // same-level adjacency through doors/passageways
  above: SpaceId | null; // vertical conduction path
  below: SpaceId | null;
  temp: number; // celsius
  burning: boolean;
  fuel: number; // 0..1, remaining combustible mass
  hazard: Hazard;
  occupants: number;
  doorsOpen: SpaceId[]; // subset of neighbors currently open
};

/**
 * A heat path between two spaces. `rate` is the fraction of the temperature
 * difference that transfers per tick (0..1). The dominant mechanism differs by
 * structure (conduction through steel, stack effect up a shaft) and lives HERE, in
 * data, never in code.
 */
export type EdgeKind = 'door' | 'passage' | 'bulkhead' | 'shaft' | 'floor';
export type Edge = {
  a: SpaceId;
  b: SpaceId;
  kind: EdgeKind;
  rate: number;
};

/** A hardwired sensor that is part of the structure (alarm panel, damage-control sensor). */
export type FixedSensor = {
  id: SensorId;
  spaceId: SpaceId;
};

/** Static description of a space as it appears in a plan file (no live state). */
export type PlanSpace = {
  id: SpaceId;
  level: number;
  hazard?: Hazard;
  occupants?: number;
  fuel?: number; // default 1
  temp?: number; // initial, default ambient
};

/**
 * A structure plan. Loaded from data/structures/*.json. Swapping ship for tower is a
 * different file, not different code.
 */
export type StructurePlan = {
  name: string;
  ambient: number; // celsius
  spaces: PlanSpace[];
  edges: Edge[]; // 'floor' edges define above/below; everything else is same-level
  sensors: FixedSensor[];
  resupply: SpaceId[]; // where drones refill
  ignition: SpaceId[]; // spaces burning at t=0
};

export type DroneClass = 'tether' | 'retardant' | 'scout' | 'relay' | 'hatch';

export type Drone = {
  id: DroneId;
  class: DroneClass;
  at: SpaceId;
  resource: number; // 0..1. tether class is always 1.
  alive: boolean;
  linked: boolean; // comms reachable from the master unit
};

export type SensorSource = 'fixed' | 'drone';

/** One temperature measurement, from a fixed sensor or a drone. */
export type Reading = {
  sensorId: SensorId; // fixed sensor id, or `${droneId}:temp` for drone-borne sensors
  source: SensorSource;
  droneId?: DroneId; // present when source === 'drone'
  spaceId: SpaceId; // where the sensor claims to be
  temp: number;
  t: number; // tick the reading was taken (may lag `Observation.t` if stale)
};

/**
 * Everything the brain is allowed to see in one tick. Drone entries are SELF-REPORTS
 * that arrived over comms, not ground truth; the corruptor may stale, drop or alter them.
 */
export type Observation = {
  t: number;
  readings: Reading[];
  drones: Drone[];
};

export type Belief = {
  estimate: Record<SpaceId, number>; // estimated temp per space
  burningSet: SpaceId[]; // most likely burning set
  ambiguous: SpaceId[][]; // groups the data cannot separate
  suspectSensors: SensorId[]; // sensors the brain believes are lying
  confidence: number; // 0..1
};

export type Command = { droneId: DroneId; goTo: SpaceId; task: string };

export type WorldState = { t: number; spaces: Space[]; drones: Drone[] };

export interface World {
  tick(commands: Command[]): { truth: WorldState; obs: Observation };
  reset(seed: number): void;
}

export interface Corruptor {
  apply(obs: Observation): Observation;
  reset(seed: number): void;
}

export interface Brain {
  step(obs: Observation): { belief: Belief; commands: Command[] };
  reset(): void;
}

export type WorldConfig = {
  plan: StructurePlan;
  seed: number;
  drones?: Array<Pick<Drone, 'id' | 'class' | 'at'>>;
};

export type CorruptionMode = 'none' | 'freeze' | 'blind' | 'saturate' | 'flashover' | 'mixed';

/**
 * The failure model's knobs. Every field here is rendered by Chase's chaos panel, so the
 * type stays flat and every field except `seed` and `mode` is optional (defaults exported
 * as DEFAULT_CORRUPTION from src/corruption).
 */
export type CorruptionConfig = {
  seed: number;
  mode: CorruptionMode;
  k?: number; // max number of sensors corrupted at once (freeze/blind budget). default 2.
  onset?: number; // first tick failures may begin. default 5.
  target?: SpaceId[]; // restrict corruption to sensors in these spaces. omit = any.
  flashoverTemp?: number; // temp above which a space's sensors all die. default 500.
  saturateAt?: number; // temp at which a sensor pins. default 300.
  ambient?: number; // what a blinded sensor reads (set to plan.ambient). default 20.
};

export type BrainConfig = {
  plan: StructurePlan; // static blueprint. Not fire state. Not truth.
  seed: number;
  /** Sensors that may be lying undetected; the estimator tolerates this many. Default 2. */
  k?: number;
};
