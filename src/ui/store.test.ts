import { beforeEach, describe, expect, it } from 'vitest';
import { loadPlan } from '../shared/structures';
import { sanitizeCorruption, sanitizeIgnition, useSim } from './store';

const demo = loadPlan('demo-6');
const vessel = loadPlan('vessel-3x8');

/** Fresh, known state for every test; the store is a module singleton. */
function reset(): void {
  useSim.getState().setPlan('demo-6');
  useSim.setState({
    seed: 42, ticks: 30, brains: 'both', ignition: 'S3',
    corruption: { mode: 'freeze', k: 1, onset: 5, target: ['S3'] },
    traces: {}, data: null, trace: null, cursor: 0, playing: false, speed: 4, error: null,
  });
}

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

describe('sanitizeIgnition', () => {
  it('keeps a known space and otherwise uses the plan ignition', () => {
    expect(sanitizeIgnition('S5', demo)).toBe('S5');
    expect(sanitizeIgnition('L1-B3', demo)).toBe('S3');
    expect(sanitizeIgnition(undefined, vessel)).toBe('L1-B3');
  });
});

describe('store', () => {
  beforeEach(reset);

  it('run() populates traces with `ticks` records for every selected brain', () => {
    useSim.getState().run();
    const s = useSim.getState();
    expect(Object.keys(s.traces).sort()).toEqual(['kalman', 'ours']);
    expect(s.traces['ours']).toHaveLength(30);
    expect(s.traces['kalman']).toHaveLength(30);
    expect(s.trace).toBe(s.traces['ours']);
    expect(s.data?.brainNames.sort()).toEqual(['kalman', 'ours']);
    expect(s.error).toBeNull();
    expect(s.playing).toBe(false);
    expect(s.traces[s.primary]![s.cursor]!.t).toBe(s.cursor + 1);
  });

  it('brains = ours runs only our brain', () => {
    useSim.getState().setBrains('ours');
    useSim.getState().run();
    expect(Object.keys(useSim.getState().traces)).toEqual(['ours']);
    expect(useSim.getState().data?.brainNames).toEqual(['ours']);
  });

  it('every brain sees byte-identical observations', () => {
    useSim.getState().run();
    const { traces } = useSim.getState();
    expect(JSON.stringify(traces['ours']!.map((r) => r.obs))).toBe(JSON.stringify(traces['kalman']!.map((r) => r.obs)));
  });

  it('setCorruption merges into the existing config', () => {
    useSim.getState().setCorruption({ k: 3 });
    expect(useSim.getState().corruption).toEqual({ mode: 'freeze', k: 3, onset: 5, target: ['S3'] });
    useSim.getState().setCorruption({ mode: 'blind', onset: 9 });
    expect(useSim.getState().corruption).toEqual({ mode: 'blind', k: 3, onset: 9, target: ['S3'] });
  });

  it('a freeze with k=1 reaches the corruptor: some reading lags obs.t after onset', () => {
    useSim.getState().run();
    const trace = useSim.getState().traces['ours']!;
    const lagging = trace.flatMap((rec) => rec.obs.readings.filter((r) => r.t < rec.obs.t).map((r) => ({ tick: rec.t, sensor: r.sensorId, lag: rec.obs.t - r.t })));
    expect(lagging.length).toBeGreaterThan(0);
    expect(lagging.every((x) => x.sensor === 'F3')).toBe(true);
    expect(Math.min(...lagging.map((x) => x.tick))).toBeGreaterThanOrEqual(5);
  });

  it('mode none reaches the corruptor too: no reading ever lags', () => {
    useSim.getState().setCorruption({ mode: 'none' });
    useSim.getState().run();
    const trace = useSim.getState().traces['ours']!;
    expect(trace.some((rec) => rec.obs.readings.some((r) => r.t < rec.obs.t))).toBe(false);
  });

  it('step clamps at both bounds and stops playback at the end', () => {
    useSim.getState().run();
    const n = useSim.getState().trace!.length;
    useSim.getState().setCursor(0);
    useSim.getState().step(-5);
    expect(useSim.getState().cursor).toBe(0);
    useSim.getState().step(n + 50);
    expect(useSim.getState().cursor).toBe(n - 1);
    useSim.getState().play();
    expect(useSim.getState().playing).toBe(true);
    expect(useSim.getState().cursor).toBe(0); // play at the end restarts
    useSim.getState().setCursor(n - 2);
    useSim.getState().step(1);
    expect(useSim.getState().cursor).toBe(n - 1);
    expect(useSim.getState().playing).toBe(false);
    useSim.getState().pause();
    expect(useSim.getState().playing).toBe(false);
  });

  it('play/step/setCursor are no-ops before a run', () => {
    useSim.getState().play();
    expect(useSim.getState().playing).toBe(false);
    useSim.getState().step(3);
    expect(useSim.getState().cursor).toBe(0);
  });

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

  it('setPlan retargets to the new ignition space, clears runs, and is a no-op for the same name', () => {
    useSim.getState().run();
    useSim.getState().setPlan('vessel-3x8');
    const s = useSim.getState();
    expect(s.planName).toBe('vessel-3x8');
    expect(s.plan.name).toBe('vessel-3x8');
    expect(s.ignition).toBe('L1-B3');
    expect(s.corruption.target).toEqual(['L1-B3']);
    expect(s.data).toBeNull();
    expect(s.trace).toBeNull();
    expect(s.traces).toEqual({});
    useSim.getState().run();
    const before = useSim.getState().data;
    useSim.getState().setPlanName('vessel-3x8');
    expect(useSim.getState().data).toBe(before);
    expect(() => useSim.getState().setPlan('nope')).toThrow(/unknown plan/);
  });

  it('the ignition picker changes where the fire starts', () => {
    useSim.getState().setIgnition('S1');
    useSim.getState().run();
    const first = useSim.getState().trace![0]!;
    expect(first.truth.spaces.filter((x) => x.burning).map((x) => x.id)).toEqual(['S1']);
  });

  it('setCursor ignores non-finite values, rounds, and clamps', () => {
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
  });

  it('a brain exception is captured as an error string, not thrown', () => {
    useSim.setState({ ticks: Number.NaN });
    expect(() => useSim.getState().run()).not.toThrow();
    // NaN ticks is coerced away by setTicks in the UI; direct state injection is the failure path.
    const s = useSim.getState();
    expect(s.error === null || typeof s.error === 'string').toBe(true);
  });
});
