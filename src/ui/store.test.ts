import { describe, expect, it } from 'vitest';
import { loadPlan } from '../shared/structures';
import { sanitizeCorruption, useSim } from './store';

const demo = loadPlan('demo-6');
const vessel = loadPlan('vessel-3x8');

describe('sanitizeCorruption', () => {
  it('drops targets the plan does not have and falls back to the ignition space', () => {
    expect(sanitizeCorruption({ mode: 'freeze', target: ['L1-B3'] }, demo)).toEqual({ mode: 'freeze', target: ['S3'] });
    expect(sanitizeCorruption({ mode: 'freeze', target: ['S3', 'L1-B3'] }, demo)).toEqual({ mode: 'freeze', target: ['S3'] });
    expect(sanitizeCorruption({ mode: 'freeze', target: ['S2'] }, demo)).toEqual({ mode: 'freeze', target: ['S2'] });
    expect(sanitizeCorruption({ mode: 'freeze', target: ['S3'] }, vessel)).toEqual({ mode: 'freeze', target: ['L1-B3'] });
  });

  it('leaves a config without a target, or with all-valid targets, untouched (same object)', () => {
    const noTarget = { mode: 'blind' as const, k: 2 };
    expect(sanitizeCorruption(noTarget, demo)).toBe(noTarget);
    const valid = { mode: 'freeze' as const, target: ['S1', 'S2'] };
    expect(sanitizeCorruption(valid, demo)).toBe(valid);
  });
});

describe('store', () => {
  it('run() never sends a target the current plan lacks, so corruption is not a silent no-op', () => {
    useSim.setState({ corruption: { mode: 'freeze', k: 1, onset: 5, target: ['L1-B3'] } });
    useSim.getState().run();
    expect(useSim.getState().corruption.target).toEqual(['S3']);
    const trace = useSim.getState().trace!;
    const late = trace[trace.length - 1]!;
    const f3 = late.obs.readings.find((r) => r.sensorId === 'F3')!;
    const truthS3 = late.truth.spaces.find((s) => s.id === 'S3')!;
    expect(Math.abs(f3.temp - truthS3.temp)).toBeGreaterThan(30); // frozen sensor is actually lying
  });

  it('setPlanName retargets to the new ignition space, clears data, and is a no-op for the same name', () => {
    useSim.getState().setPlanName('vessel-3x8');
    const s = useSim.getState();
    expect(s.planName).toBe('vessel-3x8');
    expect(s.plan.name).toBe('vessel-3x8');
    expect(s.corruption.target).toEqual(['L1-B3']);
    expect(s.data).toBeNull();
    expect(s.trace).toBeNull();
    useSim.getState().run();
    const before = useSim.getState().data;
    useSim.getState().setPlanName('vessel-3x8');
    expect(useSim.getState().data).toBe(before);
    useSim.getState().setPlanName('demo-6');
    expect(useSim.getState().corruption.target).toEqual(['S3']);
  });

  it('setCursor ignores non-finite values, rounds, and clamps; tick() stops at the end', () => {
    useSim.getState().setPlanName('demo-6');
    useSim.setState({ ticks: 10 });
    useSim.getState().run();
    const n = useSim.getState().trace!.length;
    useSim.getState().setCursor(3);
    useSim.getState().setCursor(Number.NaN);
    expect(useSim.getState().cursor).toBe(3);
    useSim.getState().setCursor(Number.POSITIVE_INFINITY);
    expect(useSim.getState().cursor).toBe(3);
    useSim.getState().setCursor(2.6);
    expect(useSim.getState().cursor).toBe(3);
    useSim.getState().setCursor(99);
    expect(useSim.getState().cursor).toBe(n - 1);
    useSim.setState({ playing: true });
    useSim.getState().tick();
    expect(useSim.getState().cursor).toBe(n - 1);
    expect(useSim.getState().playing).toBe(false);
  });
});
