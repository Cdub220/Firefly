import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_PLAN } from '../loop';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import { BEATS, BRAIN_FACTORIES, beatConfig, coerceCorruption, fromUrl, hottestNeighbor, nextIn, nextPlanName, sanitizeCorruption, sanitizeIgnition, useSim, validateRun } from './store';

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

  it('runCompare runs the same scenario with each brain driving and fills compare', () => {
    useSim.getState().setBrains('ours');
    useSim.getState().runCompare();
    const s = useSim.getState();
    expect(s.brains).toBe('both');
    expect(Object.keys(s.traces).sort()).toEqual(['kalman', 'ours']);
    expect(Object.keys(s.compare!).sort()).toEqual(['kalman', 'ours']);
    expect(s.compare!['ours']).toHaveLength(30);
    expect(s.compare!['kalman']).toHaveLength(30);
    // Ours-driven world is the same run as the main traces (same seed, same primary).
    expect(JSON.stringify(s.compare!['ours']!.map((r) => r.truth))).toBe(JSON.stringify(s.traces['ours']!.map((r) => r.truth)));
    // Kalman-driven run has kalman's own belief on every record.
    expect(s.compare!['kalman']![5]!.belief.confidence).toBeGreaterThan(0.9);
    // A plain run clears it; a plan change clears it.
    useSim.getState().run();
    expect(useSim.getState().compare).toBeNull();
    useSim.getState().runCompare();
    useSim.getState().setPlan('vessel-3x8');
    expect(useSim.getState().compare).toBeNull();
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

// ---- Dean: demo beats, recording mode, URL presets, run validation ----

const fresh = () => {
  useSim.setState({ planName: 'demo-6', plan: demo, ignition: 'S3', brains: 'both', traces: {}, seed: 42, ticks: 30, corruption: { mode: 'freeze', k: 1, onset: 5, target: ['S3'] }, data: null, trace: null, error: null, cursor: 0, playing: false, caption: '', beat: null, demo: false });
};

describe('helpers', () => {
  it('sanitizeCorruption drops targets the plan does not have and falls back to the ignition space', () => {
    expect(sanitizeCorruption({ mode: 'freeze', target: ['L1-B3'] }, demo)).toEqual({ mode: 'freeze', target: ['S3'] });
    expect(sanitizeCorruption({ mode: 'freeze', target: ['S3', 'L1-B3'] }, demo)).toEqual({ mode: 'freeze', target: ['S3'] });
    const noTarget = { mode: 'blind' as const, k: 2 };
    expect(sanitizeCorruption(noTarget, demo)).toBe(noTarget);
  });

  it('hottestNeighbor: the neighbor of the ignition space that is hottest at tick 10 of a clean run', () => {
    // S3's neighbors are S2 (door 0.15) and S4 (bulkhead 0.05): the door wins.
    expect(hottestNeighbor(demo, 'S3')).toBe('S2');
    expect(hottestNeighbor({ ...demo, edges: [] }, 'S3')).toBeNull();
  });

  it('validateRun names the three ways a run cannot happen', () => {
    expect(validateRun(demo, 'S3', 60)).toBeNull();
    expect(validateRun({ ...demo, sensors: [] }, 'S3', 60)).toMatch(/no sensors/);
    expect(validateRun(demo, 'nope', 60)).toMatch(/"nope" is not in plan/);
    expect(validateRun(demo, 'S3', 0)).toMatch(/ticks must be at least 1/);
  });

  it('fromUrl reads the filming presets and ignores junk', () => {
    expect(fromUrl('?demo=1&beat=flashover&t=30&plan=demo-6')).toEqual({ demo: true, beat: 'flashover', t: 30, plan: 'demo-6' });
    expect(fromUrl('?demo=0&beat=nope&t=abc&plan=nope')).toEqual({ demo: false, beat: null, t: null, plan: null });
    expect(fromUrl('')).toEqual({ demo: false, beat: null, t: null, plan: null });
  });

  it('nextPlanName cycles through PLAN_NAMES', () => {
    const first = PLAN_NAMES[0]!;
    let name: string = first;
    for (let i = 0; i < PLAN_NAMES.length; i++) name = nextPlanName(name);
    expect(name).toBe(first);
  });
});

describe('store robustness: an error string, never a blank page', () => {
  beforeEach(fresh);

  it('a plan with zero sensors', () => {
    useSim.setState({ plan: { ...demo, sensors: [] } });
    useSim.getState().run();
    const s = useSim.getState();
    expect(s.error).toMatch(/no sensors/);
    expect(s.data).toBeNull();
  });

  it('a plan where the ignition space is not in spaces', () => {
    useSim.setState({ plan: { ...demo, ignition: ['ghost'] }, ignition: 'ghost' });
    useSim.getState().run();
    expect(useSim.getState().error).toMatch(/"ghost" is not in plan/);
    expect(useSim.getState().data).toBeNull();
  });

  it('ticks = 0', () => {
    useSim.setState({ ticks: 0 });
    useSim.getState().run();
    expect(useSim.getState().error).toMatch(/ticks must be at least 1/);
    expect(useSim.getState().data).toBeNull();
  });

  it('a good run clears a previous error', () => {
    useSim.setState({ ticks: 0 });
    useSim.getState().run();
    expect(useSim.getState().error).not.toBeNull();
    useSim.setState({ ticks: 10 });
    useSim.getState().run();
    expect(useSim.getState().error).toBeNull();
    expect(useSim.getState().data?.ticks.length).toBe(10);
  });
});

describe('plan picker', () => {
  beforeEach(fresh);

  it('setPlanName resets ignition and target to the new plan, clears data, and is a no-op for the same name', () => {
    useSim.getState().run();
    const before = useSim.getState().data;
    useSim.getState().setPlanName('demo-6');
    expect(useSim.getState().data).toBe(before);
    for (const name of PLAN_NAMES) {
      const plan = loadPlan(name);
      useSim.setState({ planName: '__other__', corruption: { mode: 'freeze', target: ['S3'] } });
      useSim.getState().setPlanName(name);
      const s = useSim.getState();
      expect(s.planName).toBe(name);
      expect(s.plan.name).toBe(plan.name);
      expect(s.ignition).toBe(plan.ignition[0]);
      expect(s.corruption.target).toEqual([plan.ignition[0]]);
      expect(s.data).toBeNull();
    }
  });
});

describe('demo beats', () => {
  beforeEach(fresh);

  it('every beat produces a trace with the expected corruption config and a caption', () => {
    const expected: Record<string, (t: ReturnType<typeof useSim.getState>) => void> = {
      clean: (s) => expect(s.corruption).toEqual({ mode: 'none' }),
      freeze: (s) => expect(s.corruption).toEqual({ mode: 'freeze', k: 1, onset: 5, target: ['S3'] }),
      blind: (s) => expect(s.corruption).toEqual({ mode: 'blind', k: 1, onset: 5, target: ['S2'] }),
      flashover: (s) => expect(s.corruption).toEqual({ mode: 'flashover', onset: 5 }),
      building: (s) => {
        expect(s.planName).toBe(nextPlanName('demo-6'));
        expect(s.corruption.mode).toBe('flashover'); // the mode selected before the beat
      },
    };
    for (const b of BEATS) {
      useSim.getState().runBeat(b.key);
      const s = useSim.getState();
      expect(s.error).toBeNull();
      expect(s.beat).toBe(b.key);
      expect(s.caption.length).toBeGreaterThan(20);
      expect(s.data?.ticks.length).toBe(s.ticks);
      expect(s.data?.corruption).toEqual(s.corruption);
      expected[b.key]!(s);
      // The trace really carries that corruption: the freeze/blind beats break the target.
      if (b.key === 'freeze' || b.key === 'blind') {
        const last = s.trace![s.trace!.length - 1]!;
        const target = s.corruption.target![0]!;
        const r = last.obs.readings.find((x) => x.spaceId === target && x.source === 'fixed')!;
        const truth = last.truth.spaces.find((x) => x.id === target)!;
        expect(Math.abs(r.temp - truth.temp)).toBeGreaterThan(30);
      }
    }
  });

  it('beatConfig is pure and keys the hotkeys 1-5 in order', () => {
    expect(BEATS.map((b) => b.hotkey)).toEqual(['1', '2', '3', '4', '5']);
    const cur = { planName: 'demo-6', plan: DEMO_PLAN, ignition: 'S3', corruption: { mode: 'blind' as const, k: 1, target: ['S2'] }, seed: 42 };
    const a = beatConfig('building', cur);
    const b = beatConfig('building', cur);
    expect(a).toEqual(b);
    expect(a.corruption.mode).toBe('blind');
    expect(a.corruption.target).toEqual([hottestNeighbor(loadPlan(a.planName), a.ignition)]);
  });

  it('recording mode is state the view can toggle', () => {
    expect(useSim.getState().demo).toBe(false);
    useSim.getState().setDemo(true);
    expect(useSim.getState().demo).toBe(true);
  });
});

describe('round-2 regressions', () => {
  beforeEach(fresh);

  it('a run shorter than the onset lead-in still shows a tick (cursor clamped), so a beat on ticks=3 is not a blank page', () => {
    useSim.setState({ ticks: 3 });
    useSim.getState().runBeat('flashover');
    const s = useSim.getState();
    expect(s.error).toBeNull();
    expect(s.data?.ticks.length).toBe(3);
    expect(s.cursor).toBeLessThan(3);
    expect(s.data?.ticks[s.cursor]).toBeDefined();
  });

  it('a manual Run or a control change clears the previous beat and its caption', () => {
    useSim.getState().runBeat('freeze');
    expect(useSim.getState().caption).not.toBe('');
    useSim.getState().run();
    expect(useSim.getState().beat).toBeNull();
    expect(useSim.getState().caption).toBe('');
    useSim.getState().runBeat('blind');
    useSim.getState().setCorruption({ k: 2 });
    expect(useSim.getState().beat).toBeNull();
    expect(useSim.getState().caption).toBe('');
    useSim.getState().runBeat('clean');
    useSim.setState({ planName: '__other__' });
    useSim.getState().setPlanName('demo-6');
    expect(useSim.getState().caption).toBe('');
  });

  it('nextIn cycles a list and tolerates unlisted names and empty lists', () => {
    expect(nextIn(['a', 'b', 'c'], 'a')).toBe('b');
    expect(nextIn(['a', 'b', 'c'], 'c')).toBe('a');
    expect(nextIn(['a', 'b', 'c'], 'zzz')).toBe('a');
    expect(nextIn([], 'a')).toBe('a');
  });
});
