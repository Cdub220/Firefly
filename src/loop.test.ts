import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop, runLoopMulti, type TickRecord } from './loop';
import { createBrain } from './brain';
import { createKalmanBrain } from './brain/kalman';
import { HEDGE_DEFAULTS, HEDGE_ROSTER, largestPlanName } from './eval/hedge';
import { isHedge } from './eval/metrics';
import { loadPlan } from './shared/structures';

describe('runLoop', () => {
  it('runs end to end and the brain sees the ignition space as burning', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 10 });
    expect(trace).toHaveLength(10);
    const last = trace[trace.length - 1]!;
    // The fire spreads and the v0 brain thresholds on temperature, so neither set is
    // exactly the ignition set; both must still contain it.
    expect(last.truth.spaces.filter((s) => s.burning).map((s) => s.id)).toEqual(expect.arrayContaining(DEMO_PLAN.ignition));
    expect(last.belief.burningSet).toEqual(expect.arrayContaining(DEMO_PLAN.ignition));
    expect(last.obs.readings.length).toBeGreaterThan(0);
  });

  it('is deterministic: seed 42 twice gives identical traces (stepMs is wall-clock and excluded)', () => {
    const a = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 50 });
    const b = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 50 });
    const strip = (trace: typeof a) => JSON.stringify(trace.map(({ stepMs: _ms, ...rest }) => rest));
    expect(strip(a)).toBe(strip(b));
    for (const r of a) expect(r.stepMs).toBeGreaterThanOrEqual(0);
  });

  it('different seeds give different sensor noise', () => {
    const a = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 5 });
    const b = runLoop({ plan: DEMO_PLAN, seed: 43, ticks: 5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('runLoopMulti feeds every brain JSON-identical observations tick for tick', () => {
    const traces = runLoopMulti({
      plan: DEMO_PLAN,
      seed: 42,
      ticks: 25,
      corruption: { mode: 'freeze', k: 1, onset: 3 },
      brains: { ours: createBrain, kalman: createKalmanBrain },
      primary: 'ours',
    });
    expect(Object.keys(traces).sort()).toEqual(['kalman', 'ours']);
    expect(traces['ours']).toHaveLength(25);
    expect(traces['kalman']).toHaveLength(25);
    for (let i = 0; i < 25; i++) {
      expect(JSON.stringify(traces['ours']![i]!.obs)).toBe(JSON.stringify(traces['kalman']![i]!.obs));
      expect(traces['ours']![i]!.t).toBe(traces['kalman']![i]!.t);
      // Distinct copies, not one shared object: a mutating brain cannot contaminate others.
      expect(traces['ours']![i]!.obs).not.toBe(traces['kalman']![i]!.obs);
    }
  });

  it('the brain never receives ground truth', () => {
    // Structural: Observation has no `spaces` field and no `burning` anywhere.
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 3 });
    for (const rec of trace) {
      expect(Object.keys(rec.obs).sort()).toEqual(['drones', 'readings', 't']);
      expect(JSON.stringify(rec.obs)).not.toContain('burning');
    }
  });

  it('dispatch: off by default (idle drones, no commands recorded); on, the brain\'s commands move drones and change the run', () => {
    const open = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 30 });
    const closed = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 30, dispatch: true });
    expect(open.every((r) => r.commands.length === 0)).toBe(true);
    const home = DEMO_PLAN.resupply[0]!;
    expect(open[29]!.truth.drones.every((d) => d.at === home)).toBe(true);
    expect(closed.some((r) => r.commands.some((c) => c.task !== 'hold'))).toBe(true);
    expect(closed[29]!.truth.drones.some((d) => d.at !== home)).toBe(true);
    // Tethers on the fire: fewer spaces burn by tick 30 than with idle drones.
    const burning = (r: TickRecord): number => r.truth.spaces.filter((s) => s.burning).length;
    expect(burning(closed[29]!)).toBeLessThan(burning(open[29]!));
    // Deterministic either way.
    const again = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 30, dispatch: true });
    expect(JSON.stringify(again.map((r) => ({ ...r, stepMs: 0 })))).toBe(JSON.stringify(closed.map((r) => ({ ...r, stepMs: 0 }))));
  });

  it('a drone roster passes through to the world', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 2, drones: [{ id: 'X1', class: 'scout', at: 'S1' }, { id: 'X2', class: 'tether', at: 'S2' }] });
    expect(trace[0]!.truth.drones.map((d) => d.id)).toEqual(['X1', 'X2']);
    expect(trace[0]!.obs.readings.filter((r) => r.source === 'drone').map((r) => r.droneId)).toEqual(['X1', 'X2']);
  });
  it('CP4 hedge: on the closest configuration that hedges while the fire burns, a two-way ambiguity exists and two drones split across it; the prompt\'s flashover configuration is reported, not forced', () => {
    // The hedge script's roster and plan (vessel-3x8), k=2, onset 5, commands applied.
    // Under flashover the estimator never produces a hedge while the fire burns on seeds
    // 1-5 (docs/decisions.md, Sun hour 24, updated at CP3 prompt 2d). Under mixed
    // corruption, seed 2, it hedges at ticks 12-15 while L1-B3 burns.
    const plan = loadPlan(largestPlanName());
    const home = plan.resupply[0]!;
    const run = (mode: 'flashover' | 'mixed', seed = HEDGE_DEFAULTS.seed): TickRecord[] =>
      runLoop({
        plan, seed, ticks: HEDGE_DEFAULTS.ticks, dispatch: true,
        corruption: { mode, k: 2, onset: 5, target: [plan.ignition[0]!], ambient: plan.ambient },
        drones: HEDGE_ROSTER.map((d) => ({ ...d, at: home })),
      });
    const burning = (r: TickRecord): boolean => r.truth.spaces.some((s) => s.burning);
    const hedgedWhileBurning = (trace: TickRecord[]): TickRecord[] => trace.filter((r) => burning(r) && r.belief.ambiguous.length > 0 && isHedge(r.belief.ambiguous, r.commands));

    const mixed = run('mixed', 2);
    // A two-way ambiguity: a group of two or more spaces the estimator cannot separate.
    expect(mixed.some((r) => r.belief.ambiguous.some((g) => g.length >= 2))).toBe(true);
    const hedged = hedgedWhileBurning(mixed);
    expect(hedged.length).toBeGreaterThan(0);
    // The recorded fact (docs/decisions.md, results/hedge-cp4-vessel-3x8-mixed-2.txt): hedges
    // at ticks 12-15 while L1-B3 burns.
    expect(hedged.map((r) => r.t)).toEqual([12, 13, 14, 15]);
    const t12 = mixed.find((r) => r.t === 12)!;
    expect(new Set(t12.commands.map((c) => c.droneId)).size).toBeGreaterThanOrEqual(2);
    for (const r of hedged) {
      const group = r.belief.ambiguous.find((g) => new Set(r.commands.filter((c) => g.includes(c.goTo)).map((c) => c.goTo)).size >= 2)!;
      expect(group.length).toBeGreaterThanOrEqual(2);
      const inGroup = r.commands.filter((c) => group.includes(c.goTo));
      expect(new Set(inGroup.map((c) => c.droneId)).size).toBeGreaterThanOrEqual(2);
      expect(new Set(inGroup.map((c) => c.goTo)).size).toBeGreaterThanOrEqual(2);
    }

    // The prompt's own configuration: recorded as it is. If this ever starts hedging while
    // burning, update docs/decisions.md and results/hedge-cp4.txt rather than this line.
    expect(hedgedWhileBurning(run('flashover')).length).toBe(0);
  });

  it('CP3 2d, suppression-aware rollout, closed loop: demo-6 seed 1, 60 ticks, dispatch on, two tethers, mode none: burningSet flips <= 3 (14 before the change)', () => {
    // Lives here rather than in src/brain/brain.test.ts because src/brain may not import the loop.
    const home = DEMO_PLAN.resupply[0]!;
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 60, dispatch: true, drones: [{ id: 'D3', class: 'tether', at: home }, { id: 'D4', class: 'tether', at: home }] });
    // A flip: a space leaves burningSet and re-enters it later.
    let flips = 0;
    const left = new Set<string>();
    let prev = new Set<string>();
    for (const r of trace) {
      const now = new Set(r.belief.burningSet);
      for (const id of prev) if (!now.has(id)) left.add(id);
      for (const id of now) if (!prev.has(id) && left.has(id)) { flips += 1; left.delete(id); }
      prev = now;
    }
    expect(flips).toBeLessThanOrEqual(3);
    // The tethers reached the fire and it never spread: one space ever burns, and the brain
    // keeps naming it while the tethers cool it.
    expect(new Set(trace.flatMap((r) => r.truth.spaces.filter((s) => s.burning).map((s) => s.id))).size).toBe(1);
    const fire = DEMO_PLAN.ignition[0]!;
    const burningTicks = trace.filter((r) => r.truth.spaces.some((s) => s.id === fire && s.burning));
    expect(burningTicks.filter((r) => r.belief.burningSet.includes(fire)).length / burningTicks.length).toBeGreaterThan(0.9);
  });
});
