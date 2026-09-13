/**
 * computeOutcome on hand-built traces where every number is known.
 */
import { describe, expect, it } from 'vitest';
import { CONTAINED_MARGIN, computeOutcome } from './outcome';
import type { TickRecord } from '../loop';
import type { Belief, Command, Drone, SpaceId, StructurePlan } from '../shared/types';

/** A - B - C - D in a line; E isolated. */
const plan: StructurePlan = {
  name: 'line-4+1',
  ambient: 20,
  spaces: ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, level: 1 })),
  edges: [['A', 'B'], ['B', 'C'], ['C', 'D']].map(([a, b]) => ({ a: a!, b: b!, kind: 'door' as const, rate: 0.1 })),
  sensors: [{ id: 'FA', spaceId: 'A' }],
  resupply: ['A'],
  ignition: ['B'],
};
const IDS: SpaceId[] = ['A', 'B', 'C', 'D', 'E'];

type Tick = {
  t: number;
  burning?: SpaceId[];
  fuel?: Partial<Record<SpaceId, number>>;
  temps?: Partial<Record<SpaceId, number>>;
  drones?: Drone[];
  belief?: Partial<Belief>;
  commands?: Command[];
  readings?: TickRecord['obs']['readings'];
};

function rec(x: Tick): TickRecord {
  const burning = new Set(x.burning ?? []);
  const belief: Belief = {
    estimate: {}, burningSet: x.belief?.burningSet ?? [...burning], ambiguous: x.belief?.ambiguous ?? [], suspectSensors: x.belief?.suspectSensors ?? [], confidence: 0.5, probability: {},
  };
  return {
    t: x.t,
    truth: {
      t: x.t,
      spaces: IDS.map((id) => ({
        id, level: 1, neighbors: [], above: null, below: null, temp: x.temps?.[id] ?? (burning.has(id) ? 600 : 20), burning: burning.has(id),
        fuel: x.fuel?.[id] ?? 1, hazard: 'none' as const, occupants: 0, doorsOpen: [],
      })),
      drones: x.drones ?? [],
    },
    obs: { t: x.t, readings: x.readings ?? [], drones: x.drones ?? [] },
    belief,
    commands: x.commands ?? [],
    stepMs: 0,
    onset: null,
  };
}
const drone = (id: string, cls: Drone['class'], at: SpaceId, extra: Partial<Drone> = {}): Drone => ({ id, class: cls, at, resource: 1, alive: true, linked: true, ...extra });

describe('computeOutcome', () => {
  it('fireVolume, peakBurning, burned-out, extinguished, by hand', () => {
    const trace = [
      rec({ t: 1, burning: ['B'] }),
      rec({ t: 2, burning: ['B', 'C'] }),
      rec({ t: 3, burning: ['B', 'C'], fuel: { B: 0 } }),
      rec({ t: 4, burning: ['C'], fuel: { B: 0 } }),
      rec({ t: 5, burning: [], fuel: { B: 0 } }),
      ...Array.from({ length: CONTAINED_MARGIN }, (_, i) => rec({ t: 6 + i, burning: [], fuel: { B: 0 } })),
    ];
    const o = computeOutcome(trace, plan);
    expect(o.fireVolume).toBe(1 + 2 + 2 + 1);
    expect(o.peakBurning).toBe(2);
    expect(o.spacesBurnedOut).toEqual(['B']);
    expect(o.extinguishedAt).toBe(5);
    expect(o.containedAt).toBe(2); // last ignition at tick 2, and 13 ticks of nothing new after it
    expect(o.events.map((e) => e.kind)).toEqual(['ignition', 'ignition', 'contained', 'burned-out', 'extinguished']);
    expect(o.events[0]!.text).toContain('B is burning at the start');
    expect(o.events[1]!.text).toBe('C ignites');
  });

  it('containedAt is null when the last ignition is within the margin of the end; extinguishedAt null when never', () => {
    const trace = [rec({ t: 1, burning: ['B'] }), ...Array.from({ length: 5 }, (_, i) => rec({ t: 2 + i, burning: ['B'] })), rec({ t: 7, burning: ['B', 'C'] }), rec({ t: 8, burning: ['B', 'C'] })];
    const o = computeOutcome(trace, plan);
    expect(o.containedAt).toBeNull();
    expect(o.extinguishedAt).toBeNull();
    expect(o.events.some((e) => e.kind === 'contained')).toBe(false);
  });

  it('wrongFloor counts a command to a cold non-adjacent space and not one to a burning or adjacent space; hold is never wrong', () => {
    const drones = [drone('D1', 'scout', 'A'), drone('D2', 'scout', 'A'), drone('D3', 'tether', 'A')];
    const trace = [
      rec({ t: 1, burning: ['B'], drones, commands: [
        { droneId: 'D1', goTo: 'E', task: 'observe' }, // cold, not adjacent: wrong
        { droneId: 'D2', goTo: 'C', task: 'observe' }, // adjacent: fine
        { droneId: 'D3', goTo: 'B', task: 'suppress' }, // burning: fine
      ] }),
      rec({ t: 2, burning: ['B'], drones, commands: [{ droneId: 'D1', goTo: 'D', task: 'hold' }, { droneId: 'D2', goTo: 'D', task: 'observe' }] }), // hold ignored; D is two doors away: wrong
    ];
    const o = computeOutcome(trace, plan);
    expect(o.wrongFloor).toBe(2);
    expect(o.dronesUsed).toEqual({ scout: ['D1', 'D2'], tether: ['D3'] });
  });

  it('hedges counts one tick with two drones split inside one ambiguous group, not two singleton groups', () => {
    const drones = [drone('D1', 'scout', 'A'), drone('D2', 'scout', 'A')];
    const trace = [
      rec({ t: 1, burning: ['B'], drones, belief: { burningSet: ['B'], ambiguous: [['C', 'D']] }, commands: [{ droneId: 'D1', goTo: 'C', task: 'observe' }, { droneId: 'D2', goTo: 'D', task: 'observe' }] }),
      rec({ t: 2, burning: ['B'], drones, belief: { burningSet: ['B'], ambiguous: [['C'], ['D']] }, commands: [{ droneId: 'D1', goTo: 'C', task: 'observe' }, { droneId: 'D2', goTo: 'D', task: 'observe' }] }),
      rec({ t: 3, burning: ['B'], drones, belief: { burningSet: ['B'], ambiguous: [['C', 'D']] }, commands: [{ droneId: 'D1', goTo: 'C', task: 'observe' }, { droneId: 'D2', goTo: 'C', task: 'observe' }] }),
    ];
    const o = computeOutcome(trace, plan);
    expect(o.hedges).toBe(1);
    expect(o.events.filter((e) => e.kind === 'hedge').map((e) => e.t)).toEqual([1]);
    expect(o.events.find((e) => e.kind === 'hedge')!.text).toContain('{C,D}');
  });

  it('dronesUsed ignores hold; tetherTicks counts suppress in the target space; retardantSpent sums resource drops; deaths per class', () => {
    const trace = [
      rec({ t: 1, burning: ['B'], drones: [drone('D3', 'tether', 'A'), drone('D5', 'retardant', 'A'), drone('D1', 'scout', 'A')], commands: [{ droneId: 'D3', goTo: 'B', task: 'suppress' }, { droneId: 'D5', goTo: 'C', task: 'coat' }, { droneId: 'D1', goTo: 'A', task: 'hold' }] }),
      rec({ t: 2, burning: ['B'], drones: [drone('D3', 'tether', 'B'), drone('D5', 'retardant', 'C', { resource: 0.85 }), drone('D1', 'scout', 'A')], commands: [{ droneId: 'D3', goTo: 'B', task: 'suppress' }, { droneId: 'D5', goTo: 'C', task: 'coat' }, { droneId: 'D1', goTo: 'A', task: 'hold' }] }),
      rec({ t: 3, burning: ['B', 'C'], drones: [drone('D3', 'tether', 'B'), drone('D5', 'retardant', 'C', { resource: 0.7, alive: false }), drone('D1', 'scout', 'A')], commands: [{ droneId: 'D3', goTo: 'B', task: 'suppress' }, { droneId: 'D1', goTo: 'A', task: 'hold' }] }),
      rec({ t: 4, burning: ['B', 'C'], drones: [drone('D3', 'tether', 'B'), drone('D5', 'retardant', 'C', { resource: 0.7, alive: false }), drone('D1', 'scout', 'A')], commands: [{ droneId: 'D3', goTo: 'C', task: 'suppress' }, { droneId: 'D1', goTo: 'A', task: 'hold' }] }),
    ];
    const o = computeOutcome(trace, plan);
    expect(o.dronesUsed).toEqual({ retardant: ['D5'], tether: ['D3'] });
    expect(o.tetherTicks).toBe(2); // t=2 and t=3 in B on suppress; t=1 en route, t=4 retargeted to C while in B
    expect(o.retardantSpent).toBeCloseTo(0.3, 6);
    expect(o.droneDeaths).toEqual({ retardant: ['D5'] });
    expect(o.events.filter((e) => e.kind === 'drone-death').map((e) => e.t)).toEqual([3]);
    expect(o.events.filter((e) => e.kind === 'dispatch').length).toBe(3); // D3->B, D5->C, D3->C
  });

  it('sensor events: first divergence > 30 C or stale, and first suspect mark, once per sensor, in tick order', () => {
    const readings = (t: number, temp: number, rt = t): TickRecord['obs']['readings'] => [{ sensorId: 'FA', source: 'fixed', spaceId: 'A', temp, t: rt }];
    const trace = [
      rec({ t: 1, burning: ['B'], readings: readings(1, 20) }),
      rec({ t: 2, burning: ['B'], readings: readings(2, 20) }),
      rec({ t: 3, burning: ['B'], readings: readings(3, 20, 1) }), // stale by 2
      rec({ t: 4, burning: ['B'], readings: readings(4, 90), belief: { suspectSensors: ['FA'] } }), // diverges too, but already recorded
      rec({ t: 5, burning: ['B'], readings: readings(5, 90), belief: { suspectSensors: ['FA'] } }),
    ];
    const o = computeOutcome(trace, plan);
    const sensor = o.events.filter((e) => e.kind === 'sensor-diverges' || e.kind === 'sensor-suspect');
    expect(sensor.map((e) => [e.t, e.kind])).toEqual([[3, 'sensor-diverges'], [4, 'sensor-suspect']]);
    expect(sensor[0]!.text).toContain('stale');
    expect(o.events.every((e, i) => i === 0 || e.t >= o.events[i - 1]!.t)).toBe(true);
  });

  it('is pure and deterministic on an empty trace', () => {
    const o = computeOutcome([], plan);
    expect(o).toEqual({ fireVolume: 0, peakBurning: 0, spacesBurnedOut: [], containedAt: null, extinguishedAt: null, dronesUsed: {}, tetherTicks: 0, retardantSpent: 0, droneDeaths: {}, wrongFloor: 0, hedges: 0, events: [] });
  });
});
