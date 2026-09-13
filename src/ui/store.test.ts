import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPlan } from '../shared/structures';
import { BRAIN_FACTORIES, coerceCorruption, sanitizeCorruption, sanitizeIgnition, useSim } from './store';

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

  it('setCorruption removes a key set to undefined, and an empty target (which would mean "no sensor")', () => {
    useSim.getState().setCorruption({ k: undefined });
    expect(useSim.getState().corruption).toEqual({ mode: 'freeze', onset: 5, target: ['S3'] });
    expect('k' in useSim.getState().corruption).toBe(false);
    useSim.getState().setCorruption({ target: [] });
    expect('target' in useSim.getState().corruption).toBe(false);
    // And with no target, a flashover run actually kills sensors.
    useSim.getState().setCorruption({ mode: 'flashover', onset: 3, flashoverTemp: 300 });
    useSim.getState().run();
    const last = useSim.getState().trace!.at(-1)!;
    expect(last.obs.readings.filter((r) => r.source === 'fixed').length).toBeLessThan(6);
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

  it('a brain exception is captured as an error string, not thrown, and the old run is kept', () => {
    useSim.getState().run();
    const good = useSim.getState().traces;
    const real = BRAIN_FACTORIES.both.ours!;
    BRAIN_FACTORIES.both.ours = () => ({ step: () => { throw new Error('brain exploded'); }, reset: () => {} });
    try {
      expect(() => useSim.getState().run()).not.toThrow();
      expect(useSim.getState().error).toMatch(/brain exploded/);
      expect(useSim.getState().traces).toBe(good);
    } finally {
      BRAIN_FACTORIES.both.ours = real;
    }
  });

  it('a good run after a failure clears the error, and any run resets playing', () => {
    useSim.setState({ ticks: 0 });
    useSim.getState().run();
    expect(useSim.getState().error).not.toBeNull();
    useSim.setState({ ticks: 20, playing: true });
    useSim.getState().run();
    expect(useSim.getState().error).toBeNull();
    expect(useSim.getState().playing).toBe(false);
    expect(useSim.getState().trace).toHaveLength(20);
  });

  it('ticks below 1 is an error string, not an empty trace', () => {
    useSim.setState({ ticks: 0 });
    useSim.getState().run();
    expect(useSim.getState().error).toMatch(/ticks/);
    useSim.setState({ ticks: Number.NaN });
    useSim.getState().run();
    expect(useSim.getState().error).toMatch(/ticks/);
  });

  it('the opening cursor never lands past the end of a short run', () => {
    useSim.setState({ ticks: 5, corruption: { mode: 'freeze', k: 1, onset: 100, target: ['S3'] } });
    useSim.getState().run();
    expect(useSim.getState().error).toBeNull();
    expect(useSim.getState().cursor).toBe(4);
    useSim.setState({ ticks: 30, corruption: { mode: 'freeze', k: 1, onset: 5, target: ['S3'] } });
    useSim.getState().run();
    expect(useSim.getState().cursor).toBe(3);
    useSim.setState({ corruption: { mode: 'none' } });
    useSim.getState().run();
    expect(useSim.getState().cursor).toBe(0);
  });
});

describe('coerceCorruption', () => {
  const fb = { mode: 'freeze' as const, k: 1 };
  it('keeps known modes, finite numbers and string-array targets; drops the rest', () => {
    expect(coerceCorruption({ mode: 'blind', k: 2, onset: 9, target: ['S1'] }, fb)).toEqual({ mode: 'blind', k: 2, onset: 9, target: ['S1'] });
    expect(coerceCorruption({ mode: 'bogus', k: 'abc', target: 'S3' }, fb)).toEqual({ mode: 'freeze' });
    expect(coerceCorruption({ mode: 'freeze', target: null, onset: Number.NaN }, fb)).toEqual({ mode: 'freeze' });
    expect(coerceCorruption(5, fb)).toBe(fb);
    expect(coerceCorruption(null, fb)).toBe(fb);
  });
});

describe('persistence', () => {
  const mem = new Map<string, string>();
  const fakeStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  };
  beforeEach(() => { mem.clear(); vi.stubGlobal('localStorage', fakeStorage); vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  async function freshStore() {
    const mod = await import('./store');
    return mod.useSim;
  }

  it('run() saves planName/seed/ticks/corruption/ignition/brains and a fresh import restores them', async () => {
    const a = await freshStore();
    a.getState().setPlan('tower-5x4');
    a.getState().setSeed(7);
    a.getState().setTicks(12);
    a.getState().setBrains('ours');
    a.getState().setCorruption({ mode: 'blind', k: 2 });
    a.getState().setIgnition('L3-A2');
    a.getState().run();
    expect(JSON.parse(mem.get('firefly.sim.v2')!)).toEqual({
      planName: 'tower-5x4', seed: 7, ticks: 12, ignition: 'L3-A2', brains: 'ours',
      corruption: { mode: 'blind', k: 2, onset: 5, target: ['L2-B2'] },
    });
    vi.resetModules();
    const b = await freshStore();
    const s = b.getState();
    expect(s.planName).toBe('tower-5x4');
    expect(s.seed).toBe(7);
    expect(s.ticks).toBe(12);
    expect(s.brains).toBe('ours');
    expect(s.ignition).toBe('L3-A2');
    expect(s.corruption).toEqual({ mode: 'blind', k: 2, onset: 5, target: ['L2-B2'] });
  });

  it('survives garbage in storage: unknown plan, bad numbers, wrong shapes, unparsable JSON', async () => {
    mem.set('firefly.sim.v2', JSON.stringify({ planName: 'nope', seed: 'x', ticks: -3, corruption: { mode: 'bogus', target: 'S3', k: 'abc' }, ignition: 'ZZZ', brains: 'kalman-only' }));
    let s = (await freshStore()).getState();
    expect(s.planName).toBe('demo-6');
    expect(s.seed).toBe(42);
    expect(s.ticks).toBe(60);
    expect(s.brains).toBe('both');
    expect(s.ignition).toBe('S3');
    // A non-array target is dropped, which means "any sensor", not a crash.
    expect(s.corruption).toEqual({ mode: 'freeze' });
    vi.resetModules();
    mem.set('firefly.sim.v2', '{not json');
    s = (await freshStore()).getState();
    expect(s.planName).toBe('demo-6');
    vi.resetModules();
    mem.set('firefly.sim.v2', JSON.stringify({ corruption: 5 }));
    s = (await freshStore()).getState();
    expect(s.corruption.mode).toBe('freeze');
  });

  it('a target saved on another plan is sanitized at module load, before any run', async () => {
    mem.set('firefly.sim.v2', JSON.stringify({ planName: 'demo-6', corruption: { mode: 'freeze', k: 1, target: ['L1-B3'] } }));
    const s = (await freshStore()).getState();
    expect(s.corruption.target).toEqual(['S3']);
    // A target array with a non-string element is dropped entirely (any sensor), not crashed on.
    mem.set('firefly.sim.v2', JSON.stringify({ planName: 'demo-6', corruption: { mode: 'freeze', target: ['L1-B3', 42] } }));
    vi.resetModules();
    expect((await freshStore()).getState().corruption.target).toBeUndefined();
    mem.set('firefly.sim.v2', 'null');
    vi.resetModules();
    expect((await freshStore()).getState().planName).toBe('demo-6');
  });

  it('a storage that throws does not stop a run', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    const a = await freshStore();
    a.getState().run();
    expect(a.getState().error).toBeNull();
    expect(a.getState().trace?.length).toBe(60);
  });
});
