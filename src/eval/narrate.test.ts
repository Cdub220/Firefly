/** The commander's transcript on hand-built records: reasons come from the belief, orders are grouped, standing orders are not repeated. */
import { describe, expect, it } from 'vitest';
import { narrateTick, narrateTrace } from './narrate';
import { runLoop, DEMO_PLAN } from '../loop';
import type { TickRecord } from '../loop';
import type { Belief, Command, Drone } from '../shared/types';

const drone = (id: string, cls: Drone['class'], at: string): Drone => ({ id, class: cls, at, resource: 1, alive: true, linked: true });
const belief = (b: Partial<Belief>): Belief => ({ estimate: {}, burningSet: [], ambiguous: [], suspectSensors: [], confidence: 0.5, probability: {}, ...b });
const rec = (t: number, b: Belief, commands: Command[], drones: Drone[], readings = 3): TickRecord => ({
  t, belief: b, commands, stepMs: 0, onset: null,
  truth: { t, spaces: [], drones: [] },
  obs: { t, readings: Array.from({ length: readings }, (_, i) => ({ sensorId: `F${i}`, source: 'fixed' as const, spaceId: `S${i}`, temp: 20, t })), drones },
});

describe('narrate', () => {
  const fleet = [drone('D1', 'scout', 'S1'), drone('D3', 'tether', 'S1'), drone('D4', 'tether', 'S1')];

  it('says what it believes, what it cannot tell, and why each order was given, grouping drones sent together', () => {
    const b = belief({ burningSet: ['S3'], ambiguous: [['S2']], probability: { S3: 0.96, S2: 0.47 }, confidence: 0.58 });
    const lines = narrateTick(rec(4, b, [
      { droneId: 'D3', goTo: 'S3', task: 'suppress' }, { droneId: 'D4', goTo: 'S3', task: 'suppress' }, { droneId: 'D1', goTo: 'S2', task: 'observe' },
    ], fleet), undefined, DEMO_PLAN);
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain('Believes S3 burning (S3 96%; confidence 0.58)');
    expect(text).toContain('Cannot tell whether S2 is burning or just hot (S2 47%)');
    expect(text).toContain('S3 on fire (96%): sending 2 water tethers (D3, D4) to S3 to cool it');
    expect(text).toContain('Unsure whether S2 is burning or just hot (47%), need a reading there: sending 1 scout (D1) to S2 to look');
    expect(lines.every((l) => l.t === 4)).toBe(true);
  });

  it('does not repeat a standing order or an unchanged belief, and reports new suspects and blackout', () => {
    const b = belief({ burningSet: ['S3'], probability: { S3: 0.9 }, confidence: 0.4 });
    const cmds: Command[] = [{ droneId: 'D3', goTo: 'S3', task: 'suppress' }];
    const r1 = rec(5, b, cmds, fleet);
    const r2 = rec(6, belief({ ...b, suspectSensors: ['F2'] }), cmds, fleet);
    expect(narrateTick(r2, r1, DEMO_PLAN).map((l) => l.kind)).toEqual(['suspect']);
    const dark = rec(7, belief({ burningSet: ['S3'], confidence: 0.05 }), [], fleet, 0);
    expect(narrateTick(dark, r2, DEMO_PLAN)[0]!.text).toMatch(/No sensor can be trusted. Holding last known fire in S3/);
  });

  it('narrates a real closed-loop run without throwing, in tick order, with at least one dispatch', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 30, corruption: { mode: 'none' }, dispatch: true });
    const lines = narrateTrace(trace, DEMO_PLAN);
    expect(lines.length).toBeGreaterThan(3);
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.t).toBeGreaterThanOrEqual(lines[i - 1]!.t);
    expect(lines.some((l) => l.kind === 'dispatch')).toBe(true);
  });
});
