/**
 * The hedge script: plan choice, flag parsing, and the report's shape on a short run.
 */
import { describe, expect, it } from 'vitest';
import { PLAN_NAMES, loadPlan } from '../shared/structures';
import { HEDGE_DEFAULTS, HEDGE_ROSTER, hedgeReport, largestPlanName, parseHedgeArgs } from './hedge';

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
    expect(HEDGE_DEFAULTS.mode).toBe('flashover');
    expect(HEDGE_DEFAULTS.k).toBe(2);
    expect(HEDGE_ROSTER.map((d) => d.class)).toEqual(['scout', 'scout', 'tether', 'tether', 'retardant']);
  });

  it('the report lists onset..onset+20 with every drone command and the truth set, then the two numbers', () => {
    const { text, hedgeRate, containmentDelta } = hedgeReport({ plan: 'demo-6', seed: 1, ticks: 30, mode: 'flashover', k: 2, onset: 5 });
    const lines = text.split('\n');
    const rows = lines.filter((l) => /^\s*\d+\s{2}/.test(l));
    expect(rows.length).toBe(21);
    expect(rows[0]!.trim().startsWith('5 ')).toBe(true);
    expect(rows[20]!.trim().startsWith('25 ')).toBe(true);
    expect(rows.every((l) => /\[.*\]$/.test(l))).toBe(true);
    expect(text).toContain('hedgeRate = ');
    expect(text).toContain('containmentDelta = ');
    expect(Number.isFinite(hedgeRate)).toBe(true);
    expect(Number.isInteger(containmentDelta)).toBe(true);
    // Deterministic.
    expect(hedgeReport({ plan: 'demo-6', seed: 1, ticks: 30, mode: 'flashover', k: 2, onset: 5 }).text).toBe(text);
  });
});
