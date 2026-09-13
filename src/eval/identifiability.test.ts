/**
 * The identifiability construction: the base plan's sensors cannot tell H1 from H2; the
 * added sensor can; the report is deterministic and says so.
 */
import { describe, expect, it } from 'vitest';
import { steadyState } from '../brain/physics';
import { validatePlan } from '../shared/plan';
import { closedLoopCost, H1, H2, IDENT_FIXED_PLAN, IDENT_PLAN, identifiabilityReport, INDISTINGUISHABLE_C, measurementTable, removalAnalysis } from './identifiability';

describe('identifiability', () => {
  it('both plans validate; the fixed plan is the base plan plus exactly one sensor, in A1', () => {
    validatePlan(IDENT_PLAN);
    validatePlan(IDENT_FIXED_PLAN);
    expect(IDENT_FIXED_PLAN.spaces).toEqual(IDENT_PLAN.spaces);
    expect(IDENT_FIXED_PLAN.edges).toEqual(IDENT_PLAN.edges);
    expect(IDENT_FIXED_PLAN.sensors.slice(0, IDENT_PLAN.sensors.length)).toEqual(IDENT_PLAN.sensors);
    expect(IDENT_FIXED_PLAN.sensors.length).toBe(IDENT_PLAN.sensors.length + 1);
    expect(IDENT_FIXED_PLAN.sensors[IDENT_FIXED_PLAN.sensors.length - 1]!.spaceId).toBe('A1');
    expect(IDENT_PLAN.sensors.some((s) => s.spaceId === 'A1' || s.spaceId === 'B1')).toBe(false);
  });

  it('steadyState(H1) and steadyState(H2) agree at every sensor within 2 sigma on ident-7', () => {
    const s1 = steadyState(IDENT_PLAN, new Set(H1));
    const s2 = steadyState(IDENT_PLAN, new Set(H2));
    for (const s of IDENT_PLAN.sensors) expect(Math.abs(s1[s.spaceId]! - s2[s.spaceId]!)).toBeLessThan(INDISTINGUISHABLE_C);
    expect(measurementTable(IDENT_PLAN).maxDiff).toBeLessThan(INDISTINGUISHABLE_C);
    // But the wings themselves differ by hundreds of degrees: the fire is real, only unseen.
    expect(Math.abs(s1['A1']! - s2['A1']!)).toBeGreaterThan(400);
  });

  it('they disagree at the added sensor on ident-7-fixed, and only there', () => {
    const s1 = steadyState(IDENT_FIXED_PLAN, new Set(H1));
    const s2 = steadyState(IDENT_FIXED_PLAN, new Set(H2));
    const added = IDENT_FIXED_PLAN.sensors.find((s) => s.spaceId === 'A1')!;
    expect(Math.abs(s1[added.spaceId]! - s2[added.spaceId]!)).toBeGreaterThan(INDISTINGUISHABLE_C);
    for (const s of IDENT_FIXED_PLAN.sensors.filter((x) => x.id !== added.id)) expect(Math.abs(s1[s.spaceId]! - s2[s.spaceId]!)).toBeLessThan(INDISTINGUISHABLE_C);
    expect(measurementTable(IDENT_FIXED_PLAN).maxDiff).toBeGreaterThan(400);
  });

  it('k=1 removal: every sensor is already redundant on ident-7; on ident-7-fixed only the added sensor restores the tie', () => {
    expect(removalAnalysis(IDENT_PLAN).every((r) => r.identical)).toBe(true);
    const fixed = removalAnalysis(IDENT_FIXED_PLAN);
    expect(fixed.filter((r) => r.identical).map((r) => r.removed)).toEqual(['FA1']);
    for (const r of fixed.filter((r) => !r.identical)) expect(r.s2 - r.s1).toBeGreaterThan(100);
  });

  it('closed loop: the ambiguity costs drone-ticks in the empty wing that the fixed plan does not spend', () => {
    const base = closedLoopCost(IDENT_PLAN);
    const fixed = closedLoopCost(IDENT_FIXED_PLAN);
    expect(base.droneTicks.B).toBeGreaterThan(fixed.droneTicks.B);
    expect(fixed.droneTicks.B).toBe(0);
    expect(base.everBurned).toBe(1);
    expect(fixed.everBurned).toBe(1);
  });

  it('the report is deterministic and states the impossibility in one sentence', () => {
    const a = identifiabilityReport();
    const b = identifiabilityReport();
    expect(a).toBe(b);
    expect(a).toContain('No estimator can distinguish H1 from H2 with this sensor set');
    for (const h of ['STEP 1', 'STEP 2', 'STEP 3', 'STEP 4', 'STEP 5']) expect(a).toContain(h);
  });
});
