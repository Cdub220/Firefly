/**
 * Store logic under node: plan picker, demo beats, and the three robustness cases that
 * must produce an error string rather than a blank page.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PLAN } from '../loop';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import { BEATS, beatConfig, fromUrl, hottestNeighbor, nextIn, nextPlanName, sanitizeCorruption, useSim, validateRun } from './store';

const demo = loadPlan('demo-6');
const fresh = () => {
  useSim.setState({ planName: 'demo-6', plan: demo, ignition: 'S3', seed: 42, ticks: 30, corruption: { mode: 'freeze', k: 1, onset: 5, target: ['S3'] }, data: null, trace: null, error: null, cursor: 0, playing: false, caption: '', beat: null, demo: false });
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
