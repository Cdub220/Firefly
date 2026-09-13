/**
 * Allocator tests on hand-built beliefs and hypothesis sets. No world, no truth.
 */
import { describe, expect, it } from 'vitest';
import { allocate, pathLengths, scoreSpaces } from './allocator';
import { steadyState } from './physics';
import type { Belief, Command, Drone, SpaceId, StructurePlan } from '../shared/types';

/** S1 - S2 - S3 - S4 - S5 through slow doors (0.02, so a fire two doors away leaves a space under 200 C); resupply at S1; fixed sensors only at S1 and S3. */
const plan: StructurePlan = {
  name: 'line-5',
  ambient: 20,
  spaces: [
    { id: 'S1', level: 1 },
    { id: 'S2', level: 1, occupants: 2 },
    { id: 'S3', level: 1 },
    { id: 'S4', level: 1 },
    { id: 'S5', level: 1, hazard: 'fuel' },
  ],
  edges: [['S1', 'S2'], ['S2', 'S3'], ['S3', 'S4'], ['S4', 'S5']].map(([a, b]) => ({ a: a!, b: b!, kind: 'door' as const, rate: 0.02 })),
  sensors: [{ id: 'F1', spaceId: 'S1' }, { id: 'F3', spaceId: 'S3' }],
  resupply: ['S1'],
  ignition: ['S2'],
};

const drone = (id: string, cls: Drone['class'], at: SpaceId, resource = 1): Drone => ({ id, class: cls, at, resource, alive: true, linked: true });

const belief = (burningSet: SpaceId[], ambiguous: SpaceId[][] = [], estimate: Partial<Record<SpaceId, number>> = {}): Belief => ({
  estimate: { S1: 20, S2: 20, S3: 20, S4: 20, S5: 20, ...estimate },
  burningSet,
  ambiguous,
  suspectSensors: [],
  confidence: 0.5,
  probability: {},
});

const byDrone = (cmds: Command[]): Record<string, Command> => Object.fromEntries(cmds.map((c) => [c.droneId, c]));

describe('allocate', () => {
  const twoWay = { belief: belief([], [['S2'], ['S4']], { S2: 150, S3: 120, S4: 150 }), hyps: [new Set<SpaceId>(['S2']), new Set<SpaceId>(['S4'])] };

  it('the plan separates the two hypotheses at S2 and S4 (sanity of the fixture)', () => {
    expect(steadyState(plan, new Set(['S2']))['S2']!).toBeGreaterThan(200);
    expect(steadyState(plan, new Set(['S4']))['S2']!).toBeLessThan(200);
    const { information } = scoreSpaces(plan, twoWay.belief, twoWay.hyps, new Set(['S1', 'S3']));
    expect(information.get('S2')).toBeCloseTo(0.5, 10);
    expect(information.get('S4')).toBeCloseTo(0.5, 10);
    expect(information.get('S3')).toBe(0); // sensed already
  });

  it('two-way ambiguity {S2} | {S4}, two scouts at S1: one goes to S2 and one to S4', () => {
    const cmds = allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S1'), drone('D2', 'scout', 'S1')], []);
    const targets = cmds.map((c) => c.goTo).sort();
    expect(targets).toEqual(['S2', 'S4']);
    for (const c of cmds) expect(c.task).toBe('observe');
  });

  it('same ambiguity, one scout: information ties, so it takes the shorter path (S2)', () => {
    const cmds = allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S1')], []);
    expect(cmds).toEqual([{ droneId: 'D1', goTo: 'S2', task: 'observe' }]);
    // From the other end the tie breaks the other way.
    const far = allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S5')], []);
    expect(far).toEqual([{ droneId: 'D1', goTo: 'S4', task: 'observe' }]);
  });

  it('burningSet {S3} unambiguous, tether at S1: goes to S3 with task suppress', () => {
    const b = belief(['S3'], [], { S3: 500, S2: 150, S4: 150 });
    const cmds = allocate(plan, b, [new Set(['S3'])], [drone('D3', 'tether', 'S1')], []);
    expect(cmds).toEqual([{ droneId: 'D3', goTo: 'S3', task: 'suppress' }]);
  });

  it('retardant at S1 with resource 0.1: task refill, goTo a resupply space', () => {
    const b = belief(['S3'], [], { S3: 500 });
    const cmds = allocate(plan, b, [new Set(['S3'])], [drone('D5', 'retardant', 'S4', 0.1)], []);
    expect(cmds).toEqual([{ droneId: 'D5', goTo: 'S1', task: 'refill' }]);
    // With resource it coats the front (an unburned neighbour of the fire), not the fire.
    const full = allocate(plan, b, [new Set(['S3'])], [drone('D5', 'retardant', 'S1')], []);
    expect(full[0]!.task).toBe('coat');
    expect(['S2', 'S4']).toContain(full[0]!.goTo);
  });

  it('hysteresis: a drone already at its target with a 10% worse score stays', () => {
    // Two burning spaces, S2 slightly more valuable than S4 for a tether (occupants). The
    // tether is already at S4 on a previous suppress command: within 15%, it stays.
    const b = belief(['S2', 'S4'], [], { S2: 500, S4: 500, S3: 300 });
    const hyps = [new Set<SpaceId>(['S2', 'S4'])];
    const fresh = allocate(plan, b, hyps, [drone('D3', 'tether', 'S3')], []);
    expect(fresh[0]!.goTo).toBe('S2'); // 1 + 0.5*2 = 2 beats 1 at equal distance
    const { containment } = scoreSpaces(plan, b, hyps, new Set());
    const ratio = containment.get('S4')!.tether / containment.get('S2')!.tether;
    expect(ratio).toBeLessThan(1);
    // Make the gap about 10%: give S4 hazard weight via a variant plan.
    const plan2: StructurePlan = { ...plan, spaces: plan.spaces.map((s) => (s.id === 'S4' ? { ...s, occupants: 1 } : s)) };
    const c2 = scoreSpaces(plan2, b, hyps, new Set());
    expect(c2.containment.get('S4')!.tether / c2.containment.get('S2')!.tether).toBeCloseTo(0.75, 10);
    // 0.75 is outside 15%: it moves. Use occupants 1.6 -> 1.8/2.0 = 0.9, inside.
    const plan3: StructurePlan = { ...plan, spaces: plan.spaces.map((s) => (s.id === 'S4' ? { ...s, occupants: 1.6 } : s)) };
    const stay = allocate(plan3, b, hyps, [drone('D3', 'tether', 'S4')], [{ droneId: 'D3', goTo: 'S4', task: 'suppress' }]);
    expect(stay).toEqual([{ droneId: 'D3', goTo: 'S4', task: 'suppress' }]);
    const move = allocate(plan2, b, hyps, [drone('D3', 'tether', 'S4')], [{ droneId: 'D3', goTo: 'S4', task: 'suppress' }]);
    expect(move[0]!.goTo).toBe('S2');
  });

  it('safety: a scout is never sent into a space estimated above 400; a tether may go up to 600', () => {
    const b = belief(['S3'], [['S2'], ['S4']], { S3: 700, S2: 450, S4: 150 });
    const hyps = [new Set<SpaceId>(['S3', 'S2']), new Set<SpaceId>(['S3', 'S4'])];
    const scout = allocate(plan, b, hyps, [drone('D1', 'scout', 'S1')], []);
    expect(scout[0]!.goTo).not.toBe('S2');
    expect(scout[0]!.goTo).not.toBe('S3');
    const tether = allocate(plan, b, hyps, [drone('D3', 'tether', 'S1')], []);
    expect(tether[0]!.goTo).not.toBe('S3'); // 700 > 600
    expect(['S2', 'S4']).toContain(tether[0]!.goTo);
  });

  it('greedy diversity: two tethers pile onto one fire only when the second is worth less than 60% of it', () => {
    const b = belief(['S2', 'S4'], [], { S2: 500, S4: 500, S3: 300 });
    // S2 (2 occupants) is worth 2, S4 is worth 1: after the first tether takes S2 it is worth
    // 1.2, still more than S4, so both go to S2.
    const pile = allocate(plan, b, [new Set<SpaceId>(['S2', 'S4'])], [drone('D3', 'tether', 'S3'), drone('D4', 'tether', 'S3')], []);
    expect(pile.map((c) => c.goTo).sort()).toEqual(['S2', 'S2']);
    // Give S4 one occupant (worth 1.5 > 1.2): they split.
    const plan2: StructurePlan = { ...plan, spaces: plan.spaces.map((s) => (s.id === 'S4' ? { ...s, occupants: 1 } : s)) };
    const split = allocate(plan2, b, [new Set<SpaceId>(['S2', 'S4'])], [drone('D3', 'tether', 'S3'), drone('D4', 'tether', 'S3')], []);
    expect(split.map((c) => c.goTo).sort()).toEqual(['S2', 'S4']);
  });

  it('dead or unlinked drones get no command; nothing to do means hold; output is deterministic and sorted by drone id', () => {
    const b = belief([], []);
    const dead = { ...drone('D1', 'scout', 'S1'), alive: false };
    const lost = { ...drone('D2', 'scout', 'S1'), linked: false };
    expect(allocate(plan, b, [], [dead, lost], [])).toEqual([]);
    const idle = allocate(plan, b, [new Set()], [drone('D9', 'scout', 'S3'), drone('D2', 'tether', 'S1')], []);
    expect(idle).toEqual([{ droneId: 'D2', goTo: 'S1', task: 'hold' }, { droneId: 'D9', goTo: 'S3', task: 'hold' }]);
    const a = JSON.stringify(allocate(plan, twoWay.belief, twoWay.hyps, [drone('D2', 'scout', 'S5'), drone('D1', 'scout', 'S1')], []));
    const bb = JSON.stringify(allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S1'), drone('D2', 'scout', 'S5')], []));
    expect(a).toBe(bb);
    expect(byDrone(JSON.parse(a) as Command[])['D1']!.goTo).toBe('S2');
    expect(byDrone(JSON.parse(a) as Command[])['D2']!.goTo).toBe('S4');
  });

  it('pathLengths is BFS over every edge kind, door state ignored', () => {
    const d = pathLengths(plan, 'S1');
    expect([...d.entries()].sort()).toEqual([['S1', 0], ['S2', 1], ['S3', 2], ['S4', 3], ['S5', 4]]);
  });
});
