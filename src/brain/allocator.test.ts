/**
 * Allocator tests on hand-built beliefs and hypothesis sets. No world, no truth.
 */
import { describe, expect, it } from 'vitest';
import { allocate, pathLengths, scoreSpaces, W_DISTANCE, W_INFO_OTHER, W_INFO_SENSOR } from './allocator';
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
    // From S5 (no fixed sensor there; hot under {S4}, cold under {S2}, so as informative as
    // S4 itself) the scout observes where it stands: zero distance wins the tie.
    const far = allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S5')], []);
    expect(far).toEqual([{ droneId: 'D1', goTo: 'S5', task: 'observe' }]);
    // From S3 (a fixed sensor reads it, and S3 is hot under both) it must move: S2 and S4 tie, S2 by id.
    const mid = allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S3')], []);
    expect(mid).toEqual([{ droneId: 'D1', goTo: 'S2', task: 'observe' }]);
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

  it('safety: a scout is never sent into a space estimated above 400, even the informative one; a tether may go up to 800, not beyond; a drone may act where it stands', () => {
    // Two-way ambiguity where S2 (the closer, equally informative space) is estimated at 450:
    // the scout must take the long way to S4.
    const hot2 = belief([], [['S2'], ['S4']], { S2: 450, S3: 120, S4: 150 });
    const scout = allocate(plan, hot2, twoWay.hyps, [drone('D1', 'scout', 'S1')], []);
    expect(scout).toEqual([{ droneId: 'D1', goTo: 'S4', task: 'observe' }]);
    // Tether: the only fire is at 850 C (> 800): it holds rather than entering.
    const b = belief(['S3'], [], { S3: 850, S2: 150, S4: 150 });
    const tether = allocate(plan, b, [new Set(['S3'])], [drone('D3', 'tether', 'S1')], []);
    expect(tether).toEqual([{ droneId: 'D3', goTo: 'S1', task: 'hold' }]);
    // At 800 exactly it goes; a burning space plateaus near 770, so an established fire is reachable.
    const ok = allocate(plan, belief(['S3'], [], { S3: 800 }), [new Set(['S3'])], [drone('D3', 'tether', 'S1')], []);
    expect(ok[0]!.goTo).toBe('S3');
    // A tether already standing in an 850 C fire keeps suppressing it; safety is about sending, not staying.
    const inside = allocate(plan, b, [new Set(['S3'])], [drone('D3', 'tether', 'S3')], [{ droneId: 'D3', goTo: 'S3', task: 'suppress' }]);
    expect(inside).toEqual([{ droneId: 'D3', goTo: 'S3', task: 'suppress' }]);
    // A believed-burning space is unsafe for a free-flyer even when its estimate lags below 400.
    const lag = belief(['S3'], [], { S3: 150, S2: 150, S4: 150 });
    const hatch = allocate(plan, lag, [new Set<SpaceId>(['S3'])], [drone('D6', 'hatch', 'S2')], []);
    expect(hatch[0]!.goTo).not.toBe('S3');
  });

  it('a scout stays on the informative space it is already reading (its own reading does not zero its own information)', () => {
    // D1 is at S4 reading it; S2 and S4 are equally informative. Without the own-space rule
    // S4 would count as sensed, score 0, and D1 would leave for S2 and come back next tick.
    const cmds = allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S4')], [{ droneId: 'D1', goTo: 'S4', task: 'observe' }]);
    expect(cmds).toEqual([{ droneId: 'D1', goTo: 'S4', task: 'observe' }]);
    // Another drone already at S4 does make it sensed: a second scout goes to S2.
    const two = allocate(plan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S4'), drone('D2', 'scout', 'S3')], []);
    expect(byDrone(two)['D1']!.goTo).toBe('S4');
    expect(byDrone(two)['D2']!.goTo).toBe('S2');
  });

  it('containment by class: hatch counts open doors to unburned spaces, hazards and fuel weigh in, fixed sensors zero information', () => {
    const fuelPlan: StructurePlan = { ...plan, spaces: plan.spaces.map((s) => (s.id === 'S4' ? { ...s, fuel: 0.5, hazard: 'ordnance' } : s)) };
    const b = belief(['S3'], [], { S3: 500 });
    const { containment, information } = scoreSpaces(fuelPlan, b, [new Set(['S3'])], new Set(['S1', 'S3']));
    // S3 burning with doors to S2 and S4, both unburned: hatch value 1 * 2.
    expect(containment.get('S3')!.hatch).toBe(2);
    // S4: front of the fire (P 1), fuel 0.5, ordnance weight 3: 1 * 0.5 * 4 = 2; S2: 1 * 1 * 1 = 1.
    expect(containment.get('S4')!.retardant).toBe(2);
    expect(containment.get('S2')!.retardant).toBe(1);
    // S4 as a tether target if it burned: P 0 here, so 0; S3: 1 * (1 + 0 + 0) = 1.
    expect(containment.get('S4')!.tether).toBe(0);
    expect(containment.get('S3')!.tether).toBe(1);
    // With a single hypothesis nothing is informative.
    for (const v of information.values()) expect(v).toBe(0);
    // A fixed sensor's space is never informative, and the default `sensed` is the plan's unsuspected fixed sensors.
    const amb = scoreSpaces(plan, twoWay.belief, twoWay.hyps, new Set(['S2']));
    expect(amb.information.get('S2')).toBe(0);
    expect(amb.information.get('S4')).toBeCloseTo(0.5, 10);
    const sensedPlan: StructurePlan = { ...plan, sensors: [{ id: 'F1', spaceId: 'S1' }, { id: 'F2', spaceId: 'S2' }] };
    const one = allocate(sensedPlan, twoWay.belief, twoWay.hyps, [drone('D1', 'scout', 'S1')], []);
    expect(one[0]!.goTo).toBe('S4'); // S2 is read by F2, so only S4 is worth a scout
    const suspectPlan = { ...twoWay.belief, suspectSensors: ['F2'] };
    expect(allocate(sensedPlan, suspectPlan, twoWay.hyps, [drone('D1', 'scout', 'S1')], [])[0]!.goTo).toBe('S2'); // F2 distrusted: S2 needs eyes again
  });

  it('weights: sensors weigh information 2x, others 0.7x; distance costs 0.05 per hop; refill goes to the NEAREST resupply', () => {
    expect(W_INFO_SENSOR).toBe(2);
    expect(W_INFO_OTHER).toBe(0.7);
    expect(W_DISTANCE).toBe(0.05);
    // A certain fire at S2 and a maybe-fire at S4 ({S2,S4} vs {S2}). For a tether S2 is worth
    // 1 * (1 + 0.5*2) = 2 against S4's 0.5 + 0.7*0.5: containment wins. For a scout only
    // information counts, and S2 (hot under both) has none: it goes to S4.
    const b = belief(['S2'], [['S4']], { S2: 500, S4: 150, S5: 60 });
    const hyps = [new Set<SpaceId>(['S2', 'S4']), new Set<SpaceId>(['S2'])];
    expect(allocate(plan, b, hyps, [drone('D3', 'tether', 'S3')], [])[0]!.goTo).toBe('S2');
    expect(allocate(plan, b, hyps, [drone('D1', 'scout', 'S3')], [])[0]!.goTo).toBe('S4');
    // Distance: S5 is as informative as S4 (hot only if S4 burns); a scout already at S5 stays
    // (distance 0), one at S3 prefers S4 (1 hop) over S5 (2 hops).
    expect(allocate(plan, b, hyps, [drone('D1', 'scout', 'S5')], [])[0]!.goTo).toBe('S5');
    // Nearest resupply: with resupply at S1 and S5, an empty retardant at S4 goes to S5.
    const two: StructurePlan = { ...plan, resupply: ['S1', 'S5'] };
    expect(allocate(two, b, hyps, [drone('D5', 'retardant', 'S4', 0.05)], [])).toEqual([{ droneId: 'D5', goTo: 'S5', task: 'refill' }]);
    // Tethers never refill, whatever their resource says.
    expect(allocate(two, b, hyps, [drone('D3', 'tether', 'S4', 0)], [])[0]!.task).toBe('suppress');
  });

  it('hysteresis never carries a foreign task: the class decides', () => {
    const b = belief(['S2', 'S4'], [], { S2: 500, S4: 500 });
    const plan3: StructurePlan = { ...plan, spaces: plan.spaces.map((s) => (s.id === 'S4' ? { ...s, occupants: 1.6 } : s)) };
    const stay = allocate(plan3, b, [new Set<SpaceId>(['S2', 'S4'])], [drone('D3', 'tether', 'S4')], [{ droneId: 'D3', goTo: 'S4', task: 'coat' }]);
    expect(stay).toEqual([{ droneId: 'D3', goTo: 'S4', task: 'suppress' }]);
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
    expect(byDrone(JSON.parse(a) as Command[])['D2']!.goTo).toBe('S5'); // already on an informative space
  });

  it('pathLengths is BFS over every edge kind, door state ignored', () => {
    const d = pathLengths(plan, 'S1');
    expect([...d.entries()].sort()).toEqual([['S1', 0], ['S2', 1], ['S3', 2], ['S4', 3], ['S5', 4]]);
  });
});
