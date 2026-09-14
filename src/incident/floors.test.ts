import { describe, expect, it } from 'vitest';
import type { TickRecord } from '../loop';
import { certainAt, firstBurningByFloor, firstNamedByFloor, floorsBurningByTick, knownAtFromStages } from './floors';

const rec = (t: number, burning: string[], named: string[], conf: number): TickRecord => ({
  t,
  truth: { t, spaces: burning.map((id) => ({ id, level: Number(id.slice(1, 3)), burning: true })), drones: [] },
  belief: { burningSet: named, confidence: conf },
}) as unknown as TickRecord;

describe('per-floor readings in minutes', () => {
  const trace = [rec(1, ['L22-A3'], [], 0.1), rec(2, ['L22-A3'], ['L22-A4'], 0.5), rec(3, ['L22-A3', 'L23-A1'], ['L22-A3', 'L23-A1'], 0.95), rec(4, ['L23-A1'], ['L23-A1'], 0.95)];
  it('first named / first burning / certain, at 4 minutes a tick', () => {
    expect(firstNamedByFloor(trace, 4)).toEqual({ 22: 8, 23: 12 });
    expect(firstBurningByFloor(trace, 4)).toEqual({ 22: 4, 23: 12 });
    expect(certainAt(trace, 4, 22)).toBe(12);
    expect(certainAt(trace, 4, 25)).toBeNull();
    expect(floorsBurningByTick(trace)).toEqual([[22], [22], [22, 23], [23]]);
    expect(firstNamedByFloor([rec(1, [], ['S3'], 1)], 4)).toEqual({}); // non-floor ids are ignored
  });
  it('knownAt keeps the earliest stage per floor whatever the input order', () => {
    expect(knownAtFromStages([{ minute: 80, floors: [22, 23], confidence: 0.9 }, { minute: 8, floors: [22], confidence: 0.9 }, { minute: 352, floors: [24], confidence: 0.9 }])).toEqual({ 22: 8, 23: 80, 24: 352 });
    expect(knownAtFromStages([])).toEqual({});
  });
});
