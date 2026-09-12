import { describe, expect, it } from 'vitest';
import type { Command, StructurePlan, WorldConfig, WorldState } from '../shared/types';
import demo from '../../data/structures/demo-6.json';
import { DEFAULT_DRONES, bfsPath, createWorld } from './index';
import { COAT_RATE, DRONE_DEATH, DRONE_DEATH_TETHER } from './constants';

const DEMO = demo as StructurePlan;

type Roster = NonNullable<WorldConfig['drones']>;

/** Run `ticks` ticks; `commands` are issued on the first tick only, like a brain that speaks once. */
function run(plan: StructurePlan, seed: number, drones: Roster, commands: Command[], ticks: number): WorldState[] {
  const w = createWorld({ plan, seed, drones });
  const out: WorldState[] = [];
  for (let i = 0; i < ticks; i++) out.push(w.tick(i === 0 ? commands : []).truth);
  return out;
}

const drone = (s: WorldState, id: string) => s.drones.find((d) => d.id === id)!;
const space = (s: WorldState, id: string) => s.spaces.find((x) => x.id === id)!;

describe('movement', () => {
  it('a drone commanded from S1 to S4 arrives in exactly BFS-distance ticks', () => {
    const dist = bfsPath(DEMO, 'S1', 'S4')!.length - 1;
    expect(dist).toBe(3);
    const trace = run(DEMO, 1, [{ id: 'D1', class: 'scout', at: 'S1' }], [{ droneId: 'D1', goTo: 'S4', task: 'observe' }], dist + 1);
    // trace[i] is the state after i + 1 ticks.
    expect(drone(trace[dist - 2]!, 'D1').at).not.toBe('S4');
    expect(drone(trace[dist - 1]!, 'D1').at).toBe('S4');
    expect(drone(trace[dist]!, 'D1').at).toBe('S4');
    for (let i = 1; i < trace.length; i++) {
      // One edge per tick, and always in a space.
      const prev = drone(trace[i - 1]!, 'D1').at;
      const cur = drone(trace[i]!, 'D1').at;
      expect(DEMO.spaces.some((s) => s.id === cur)).toBe(true);
      if (prev !== cur) expect(bfsPath(DEMO, prev, cur)!.length).toBe(2);
    }
  });

  it('routes around a lethal space when a safe route exists', () => {
    // S1 -> S4 is 3 edges via S3 (burning, 450 C+) or via S5. A scout takes S5.
    const trace = run(DEMO, 1, [{ id: 'D1', class: 'scout', at: 'S1' }], [{ droneId: 'D1', goTo: 'S4', task: 'observe' }], 3);
    expect(trace.map((s) => drone(s, 'D1').at)).not.toContain('S3');
  });

  it('a new command with a different goTo replans', () => {
    const w = createWorld({ plan: DEMO, seed: 1, drones: [{ id: 'D1', class: 'scout', at: 'S1' }] });
    w.tick([{ droneId: 'D1', goTo: 'S4', task: 'observe' }]);
    const back = w.tick([{ droneId: 'D1', goTo: 'S1', task: 'observe' }]).truth;
    expect(drone(back, 'D1').at).toBe('S1');
  });

  it('a scout commanded into a 600 C space stops adjacent and stays alive', () => {
    const trace = run(DEMO, 1, [{ id: 'D1', class: 'scout', at: 'S4' }], [{ droneId: 'D1', goTo: 'S3', task: 'observe' }], 4);
    const last = trace[trace.length - 1]!;
    expect(space(last, 'S3').temp).toBeGreaterThan(600);
    expect(drone(last, 'D1').alive).toBe(true);
    expect(drone(last, 'D1').at).toBe('S4');
    expect(bfsPath(DEMO, 'S4', 'S3')!.length).toBe(2);
  });

  it('ignores commands for dead drones and unknown spaces', () => {
    const w = createWorld({ plan: DEMO, seed: 1, drones: [{ id: 'D1', class: 'scout', at: 'S1' }] });
    const bad = w.tick([{ droneId: 'D1', goTo: 'NOPE', task: 'observe' }, { droneId: 'D9', goTo: 'S2', task: 'observe' }]).truth;
    expect(drone(bad, 'D1').at).toBe('S1');
  });
});

describe('effects', () => {
  it('a tether with suppress in the ignition space makes it cooler after 10 ticks than without', () => {
    const control = run(DEMO, 1, [], [], 10);
    const held = run(DEMO, 1, [{ id: 'T', class: 'tether', at: 'S3' }], [{ droneId: 'T', goTo: 'S3', task: 'suppress' }], 10);
    const ctlTemp = space(control[9]!, 'S3').temp;
    const heldTemp = space(held[9]!, 'S3').temp;
    expect(heldTemp).toBeLessThan(ctlTemp);
    expect(ctlTemp - heldTemp).toBeGreaterThan(200);
    expect(drone(held[9]!, 'T').alive).toBe(true);
    expect(drone(held[9]!, 'T').resource).toBe(1);
  });

  it('two tethers stack and hold the space colder than one', () => {
    const one = run(DEMO, 1, [{ id: 'T', class: 'tether', at: 'S3' }], [{ droneId: 'T', goTo: 'S3', task: 'suppress' }], 20);
    const two = run(
      DEMO, 1,
      [{ id: 'T', class: 'tether', at: 'S3' }, { id: 'U', class: 'tether', at: 'S3' }],
      [{ droneId: 'T', goTo: 'S3', task: 'suppress' }, { droneId: 'U', goTo: 'S3', task: 'suppress' }],
      20,
    );
    expect(space(two[19]!, 'S3').temp).toBeLessThan(space(one[19]!, 'S3').temp - 100);
  });

  it('suppress from a non-tether does nothing', () => {
    const control = run(DEMO, 1, [], [], 10);
    const scout = run(DEMO, 1, [{ id: 'X', class: 'tether', at: 'S3' }], [], 10);
    const fake = run(DEMO, 1, [{ id: 'X', class: 'hatch', at: 'S3' }], [{ droneId: 'X', goTo: 'S3', task: 'suppress' }], 1);
    // A tether that was never told to suppress, and a hatch told to, both leave physics alone.
    expect(space(scout[9]!, 'S3').temp).toBeCloseTo(space(control[9]!, 'S3').temp, 9);
    expect(space(fake[0]!, 'S3').temp).toBeCloseTo(space(control[0]!, 'S3').temp, 9);
  });

  it('a retardant coating a neighbor of the ignition space prevents or delays its ignition', () => {
    const firstBurn = (trace: WorldState[]) => trace.find((s) => space(s, 'S2').burning)?.t ?? Infinity;
    const control = run(DEMO, 1, [], [], 80);
    const coated = run(DEMO, 1, [{ id: 'R', class: 'retardant', at: 'S1' }], [{ droneId: 'R', goTo: 'S2', task: 'coat' }], 80);
    expect(firstBurn(control)).toBeLessThan(Infinity);
    expect(firstBurn(coated)).toBeGreaterThan(firstBurn(control));
    expect(space(coated[79]!, 'S2').fuel).toBeLessThanOrEqual(0.2);
  });

  it('coating spends resource at COAT_RATE per tick and stops at zero', () => {
    const trace = run(DEMO, 1, [{ id: 'R', class: 'retardant', at: 'S1' }], [{ droneId: 'R', goTo: 'S1', task: 'coat' }], 10);
    expect(drone(trace[0]!, 'R').resource).toBeCloseTo(1 - COAT_RATE, 9);
    expect(space(trace[0]!, 'S1').fuel).toBeCloseTo(1 - COAT_RATE, 9);
    expect(drone(trace[9]!, 'R').resource).toBe(0);
    expect(space(trace[9]!, 'S1').fuel).toBe(0);
  });

  it('a hatch closes every door of its goTo space on both sides', () => {
    const trace = run(DEMO, 1, [{ id: 'H', class: 'hatch', at: 'S1' }], [{ droneId: 'H', goTo: 'S2', task: 'close-door' }], 1);
    const s = trace[0]!;
    expect(space(s, 'S2').doorsOpen).toEqual([]);
    for (const n of ['S1', 'S3', 'S5']) expect(space(s, n).doorsOpen).not.toContain('S2');
    // Untouched doors elsewhere stay open.
    expect(space(s, 'S5').doorsOpen).toEqual(expect.arrayContaining(['S4', 'S6']));
  });

  it('refill at a resupply space restores resource, elsewhere it does not', () => {
    const w = createWorld({ plan: DEMO, seed: 1, drones: [{ id: 'R', class: 'retardant', at: 'S1' }] });
    for (let i = 0; i < 8; i++) w.tick(i === 0 ? [{ droneId: 'R', goTo: 'S1', task: 'coat' }] : []);
    // S6 is one bulkhead edge from S1 and still cool at t=9; S2 is not.
    const away = w.tick([{ droneId: 'R', goTo: 'S6', task: 'refill' }]).truth;
    expect(drone(away, 'R').at).toBe('S6');
    expect(drone(away, 'R').resource).toBe(0);
    const home = w.tick([{ droneId: 'R', goTo: 'S1', task: 'refill' }]).truth;
    expect(drone(home, 'R').at).toBe('S1');
    expect(drone(home, 'R').resource).toBe(1);
  });
});

describe('death and observation', () => {
  it('a drone in a space when it crosses DRONE_DEATH dies and vanishes from obs.drones and readings', () => {
    const w = createWorld({ plan: DEMO, seed: 1, drones: [{ id: 'D1', class: 'scout', at: 'S3' }] });
    const { truth, obs } = w.tick([]);
    expect(space(truth, 'S3').temp).toBeGreaterThanOrEqual(DRONE_DEATH);
    expect(drone(truth, 'D1').alive).toBe(false);
    expect(obs.drones).toEqual([]);
    expect(obs.readings.filter((r) => r.source === 'drone')).toEqual([]);
    // Dead drones do not move.
    const later = w.tick([{ droneId: 'D1', goTo: 'S1', task: 'observe' }]).truth;
    expect(drone(later, 'D1').at).toBe('S3');
  });

  it('a tether survives a burning space below DRONE_DEATH_TETHER; a scout there dies', () => {
    const t = run(DEMO, 1, [{ id: 'T', class: 'tether', at: 'S3' }], [], 5);
    const s = run(DEMO, 1, [{ id: 'S', class: 'scout', at: 'S3' }], [], 5);
    expect(space(t[4]!, 'S3').temp).toBeLessThan(DRONE_DEATH_TETHER);
    expect(drone(t[4]!, 'T').alive).toBe(true);
    expect(drone(s[4]!, 'S').alive).toBe(false);
  });

  it('obs.drones lists every live drone with its true state', () => {
    const w = createWorld({ plan: DEMO, seed: 1 });
    const { truth, obs } = w.tick([]);
    expect(obs.drones.map((d) => d.id)).toEqual(truth.drones.filter((d) => d.alive).map((d) => d.id));
    for (const d of obs.drones) {
      expect(d).toEqual(drone(truth, d.id));
      expect(d.linked).toBe(true);
    }
  });

  it('the default roster is 2 scouts, 2 tethers, 1 retardant, 1 hatch at the first resupply space', () => {
    expect(DEFAULT_DRONES.map((d) => d.class)).toEqual(['scout', 'scout', 'tether', 'tether', 'retardant', 'hatch']);
    const { truth } = createWorld({ plan: DEMO, seed: 1 }).tick([]);
    expect(truth.drones.map((d) => d.id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    for (const d of truth.drones) expect(d.at).toBe(DEMO.resupply[0]);
  });

  it('is deterministic with drones acting', () => {
    const cmds: Command[] = [
      { droneId: 'D1', goTo: 'S4', task: 'observe' },
      { droneId: 'D3', goTo: 'S3', task: 'suppress' },
      { droneId: 'D5', goTo: 'S2', task: 'coat' },
      { droneId: 'D6', goTo: 'S5', task: 'close-door' },
    ];
    const go = () => {
      const w = createWorld({ plan: DEMO, seed: 42 });
      const out = [];
      for (let i = 0; i < 60; i++) out.push(w.tick(i === 0 ? cmds : []));
      return JSON.stringify(out);
    };
    expect(go()).toBe(go());
  });
});
