import { describe, expect, it } from 'vitest';
import { makeRng } from './rng';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 100 }, () => a.next());
    const ys = Array.from({ length: 100 }, () => b.next());
    expect(xs).toEqual(ys);
  });
  it('differs across seeds', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });
  it('stays in [0,1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('forks are independent and deterministic', () => {
    const a = makeRng(42).fork('world');
    const b = makeRng(42).fork('world');
    const c = makeRng(42).fork('brain');
    expect(a.next()).toBe(b.next());
    expect(makeRng(42).fork('world').next()).not.toBe(c.next());
  });
});
