/**
 * The hedge script: plan choice, flag parsing, and the report's shape on a short run.
 */
import { describe, expect, it } from 'vitest';
import { PLAN_NAMES, loadPlan } from '../shared/structures';
import { HEDGE_DEFAULTS, HEDGE_ROSTER, hedgeOutputPath, hedgeReport, largestPlanName, parseHedgeArgs } from './hedge';
import { computeMetrics } from './metrics';

describe('hedge', () => {
  it('largestPlanName picks the plan with the most spaces', () => {
    const name = largestPlanName();
    const n = loadPlan(name).spaces.length;
    for (const p of PLAN_NAMES) expect(loadPlan(p).spaces.length).toBeLessThanOrEqual(n);
    expect(largestPlanName(['demo-6'])).toBe('demo-6');
  });

  it('parses flags and rejects nonsense', () => {
    expect(parseHedgeArgs([])).toEqual(HEDGE_DEFAULTS);
    expect(parseHedgeArgs(['--plan', 'demo-6', '--seed', '3', '--ticks', '30', '--k', '1', '--onset', '2', '--mode', 'freeze'])).toEqual({ plan: 'demo-6', seed: 3, ticks: 30, k: 1, onset: 2, mode: 'freeze' });
    expect(() => parseHedgeArgs(['--plan', 'nope'])).toThrow(/unknown plan/);
    expect(() => parseHedgeArgs(['--seed', 'x'])).toThrow(/--seed/);
    expect(() => parseHedgeArgs(['--mode', 'bogus'])).toThrow(/--mode/);
    expect(() => parseHedgeArgs(['--ticks', '0'])).toThrow(/--ticks/);
    expect(() => parseHedgeArgs(['--k', '0'])).toThrow(/--k/);
    expect(parseHedgeArgs(['--onset', '0']).onset).toBe(0);
    expect(hedgeOutputPath(HEDGE_DEFAULTS)).toBe('results/hedge-cp4.txt');
    expect(hedgeOutputPath({ ...HEDGE_DEFAULTS, mode: 'blind' })).toBe('results/hedge-cp4-vessel-3x8-blind-1.txt');
    expect(hedgeOutputPath({ ...HEDGE_DEFAULTS, plan: 'demo-6', seed: 3, k: 1, ticks: 80 })).toBe('results/hedge-cp4-demo-6-flashover-3-k1-80t.txt');
    expect(hedgeOutputPath({ ...HEDGE_DEFAULTS, mode: 'blind', onset: 9 })).toBe('results/hedge-cp4-vessel-3x8-blind-1-onset9.txt');
    expect(HEDGE_DEFAULTS.mode).toBe('flashover');
    expect(HEDGE_DEFAULTS.k).toBe(2);
    expect(HEDGE_ROSTER.map((d) => d.class)).toEqual(['scout', 'scout', 'tether', 'tether', 'retardant']);
  });

  it('the report lists onset..onset+20 with every drone command and the truth set, then the two numbers', () => {
    const o = { plan: 'demo-6', seed: 1, ticks: 30, mode: 'flashover' as const, k: 2, onset: 5 };
    const { text, hedgeRate, containmentDelta, run, hedgedTicks } = hedgeReport(o);
    const lines = text.split('\n');
    const rows = lines.filter((l) => /^\s*\d+\s{2}/.test(l));
    expect(rows.length).toBe(21);
    expect(rows[0]!.trim().startsWith('5 ')).toBe(true);
    expect(rows[20]!.trim().startsWith('25 ')).toBe(true);
    expect(rows.every((l) => /\[.*\]$/.test(l))).toBe(true);
    // Every command is printed as "D1->S4 observe" with its task word; the roster is the world's.
    expect(rows.some((l) => /D\d->\S+ (observe|suppress|coat|hold|refill)/.test(l))).toBe(true);
    expect(lines[0]).toContain(`roster=${run.withAllocator[0]!.truth.drones.map((d) => `${d.id}:${d.class}`).join(',')}`);
    expect(run.withAllocator[0]!.truth.drones.map((d) => d.class)).toEqual(HEDGE_ROSTER.map((d) => d.class));
    // The corruption really targets the ignition space and nothing else: under freeze the only
    // readings that ever lag are the ignition space's (a random victim would be elsewhere too).
    const ign = loadPlan('demo-6').ignition[0]!;
    const frozen = hedgeReport({ ...o, mode: 'freeze' }).run.withAllocator;
    const lagging = frozen.flatMap((r) => r.obs.readings.filter((x) => x.t < r.obs.t));
    expect(lagging.length).toBeGreaterThan(0);
    expect(lagging.every((x) => x.spaceId === ign)).toBe(true);
    // The numbers are the metrics' numbers, and the hedged-tick list matches the metric.
    expect(hedgeRate).toBe(computeMetrics(run.withAllocator, { onset: 5 }).hedgeRate);
    expect(hedgedTicks.filter((t) => t >= 5).length / run.withAllocator.filter((r) => r.t >= 5).length).toBeCloseTo(hedgeRate, 12);
    // The prompt's own configuration never hedges (recorded fact, CP3 prompt 2d); the report says so.
    const strict = hedgeReport(HEDGE_DEFAULTS);
    expect(strict.hedgedTicks).toEqual([]);
    expect(strict.hedgeRate).toBe(0);
    expect(strict.text).toContain('hedged ticks: none');
    expect(strict.text).toContain('NO hedge inside the printed window');
    // The closest configuration hedges at ticks 12-15, and hedgeRate is the strict per-group
    // number from the metric, not the broader spread diagnostic.
    const closest = hedgeReport({ ...HEDGE_DEFAULTS, mode: 'mixed', seed: 2 });
    expect(closest.hedgedTicks).toEqual([12, 13, 14, 15]);
    expect(closest.hedgeRate).toBe(computeMetrics(closest.run.withAllocator, { onset: 5 }).hedgeRate);
    expect(closest.hedgeRate).toBeCloseTo(4 / 56, 12);
    expect(text).toContain('hedgeRate = ');
    expect(text).toContain('hedged ticks: ');
    expect(text).toContain('containmentDelta = ');
    expect(Number.isFinite(hedgeRate)).toBe(true);
    expect(Number.isInteger(containmentDelta)).toBe(true);
    expect(containmentDelta).toBe(run.withAllocator[29]!.truth.spaces.filter((s) => s.burning).length - run.nullAllocator[29]!.truth.spaces.filter((s) => s.burning).length);
    // Deterministic.
    expect(hedgeReport(o).text).toBe(text);
  });
});
