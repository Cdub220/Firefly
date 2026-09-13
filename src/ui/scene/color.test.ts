import { describe, expect, it } from 'vitest';
import { AMBER, RED, SLATE, tempHex, tempRgb, WHITE_HOT } from './color';

describe('temperature color ramp', () => {
  it('is slate at or below ambient, amber at 200, red at 400, white-hot from 600', () => {
    expect(tempRgb(22, 22)).toEqual(SLATE);
    expect(tempRgb(-5, 22)).toEqual(SLATE);
    expect(tempRgb(200, 22)).toEqual(AMBER);
    expect(tempRgb(400, 22)).toEqual(RED);
    expect(tempRgb(600, 22)).toEqual(WHITE_HOT);
    expect(tempRgb(900, 22)).toEqual(WHITE_HOT);
    expect(tempRgb(Number.NaN, 22)).toEqual(SLATE);
  });

  it('interpolates without jumps: red rises to 200, green falls 200 to 400, blue rises 400 to 600', () => {
    let prevR = -1;
    for (let t = 22; t <= 200; t += 2) { const [r] = tempRgb(t, 22); expect(r).toBeGreaterThanOrEqual(prevR); prevR = r; }
    let prevG = 256;
    for (let t = 200; t <= 400; t += 2) { const [, g] = tempRgb(t, 22); expect(g).toBeLessThanOrEqual(prevG); prevG = g; }
    let prevB = -1;
    for (let t = 400; t <= 600; t += 2) { const [, , b] = tempRgb(t, 22); expect(b).toBeGreaterThanOrEqual(prevB); prevB = b; }
    // No discontinuity at the breakpoints: neighbours differ by a few units at most.
    for (const edge of [200, 400, 600]) {
      const a = tempRgb(edge - 1, 22);
      const b = tempRgb(edge + 1, 22);
      expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))).toBeLessThan(6);
    }
  });

  it('formats as a 7-character hex string', () => {
    expect(tempHex(22, 22)).toBe('#475569');
    expect(tempHex(400, 22)).toBe('#ef4444');
    expect(tempHex(60, 22)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
