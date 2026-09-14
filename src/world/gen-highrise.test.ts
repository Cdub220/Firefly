import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePlan } from '../shared/plan';
import { ALL_PLAN_NAMES, INCIDENT_PLAN_NAMES, PLAN_NAMES, isPlanName, loadPlan } from '../shared/structures';
import { makeHighrisePlans, planText, spaceId, type HighriseSpec } from './gen-highrise';

const DIR = resolve(__dirname, '../../data/incidents/one-meridian-plaza');
const spec = JSON.parse(readFileSync(resolve(DIR, 'plan.spec.json'), 'utf8')) as HighriseSpec;

describe('gen-highrise', () => {
  const { asBuilt, instrumented } = makeHighrisePlans(spec);

  it('the committed plan files are exactly what the spec generates', () => {
    expect(readFileSync(resolve(DIR, 'plan.json'), 'utf8')).toBe(planText(asBuilt));
    expect(readFileSync(resolve(DIR, 'plan.instrumented.json'), 'utf8')).toBe(planText(instrumented));
  });

  it('builds every zone on every floor, valid, with floor edges only inside a column', () => {
    const floors = spec.floors.to - spec.floors.from + 1;
    expect(asBuilt.spaces).toHaveLength(floors * spec.zones.length);
    expect(() => validatePlan(asBuilt)).not.toThrow();
    expect(() => validatePlan(instrumented)).not.toThrow();
    for (const e of asBuilt.edges) {
      const [la, za] = [Number(e.a.match(/^L(\d+)-/)![1]), e.a.split('-')[1]];
      const [lb, zb] = [Number(e.b.match(/^L(\d+)-/)![1]), e.b.split('-')[1]];
      if (e.kind === 'floor') { expect(za).toBe(zb); expect(lb - la).toBe(1); }
      else if (la !== lb) expect(Math.abs(lb - la)).toBe(1);
    }
    // One 'floor' edge per office column per storey gap, so above/below stay single-valued.
    const floorEdges = asBuilt.edges.filter((e) => e.kind === 'floor');
    expect(floorEdges).toHaveLength((floors - 1) * spec.verticalEdges.filter((v) => v.kind === 'floor').length);
    expect(new Set(floorEdges.map((e) => e.a)).size).toBe(floorEdges.length);
  });

  it('as-built sensors leave the zone of origin unsensed; instrumented covers every space', () => {
    const origin = spec.ignition[0]!;
    expect(asBuilt.sensors.some((s) => s.spaceId === origin)).toBe(false);
    expect(asBuilt.sensors).toHaveLength((spec.floors.to - spec.floors.from + 1) * spec.sensors.asBuilt.length);
    expect(instrumented.sensors.map((s) => s.spaceId).sort()).toEqual(instrumented.spaces.map((s) => s.id).sort());
    expect(instrumented.name).toBe(`${spec.name}-instrumented`);
  });

  it('carries the report-specific paths and overrides: the open stair 21-22 and the sprinklered floors', () => {
    expect(asBuilt.edges.some((e) => e.a === spaceId(21, 'B2') && e.b === spaceId(22, 'B2') && e.kind === 'shaft' && e.rate === 0.3)).toBe(true);
    for (const z of spec.zones) {
      expect(asBuilt.spaces.find((s) => s.id === spaceId(20, z.id))!.fuel).toBe(0.15); // bottom edge, cannot ignite
      expect(asBuilt.spaces.find((s) => s.id === spaceId(30, z.id))!.fuel).toBe(0.25); // sprinklered, ignites briefly
      expect(asBuilt.spaces.find((s) => s.id === spaceId(31, z.id))!.fuel).toBe(0.1); // sprinklered, cannot ignite
    }
    expect(asBuilt.spaces.find((s) => s.id === spaceId(22, 'A3'))!.fuel).toBeUndefined(); // default 1
    expect(asBuilt.ignition).toEqual(['L22-A3']);
    expect(asBuilt.resupply).toEqual(['L20-B2']);
  });

  it('is loadable by both generic names but stays out of the evaluation family PLAN_NAMES', () => {
    expect(loadPlan('highrise-12x9').spaces).toHaveLength(asBuilt.spaces.length);
    expect(loadPlan('highrise-12x9-instrumented').sensors).toHaveLength(instrumented.sensors.length);
    expect(isPlanName('highrise-12x9')).toBe(true);
    expect(PLAN_NAMES).toEqual(['demo-6', 'vessel-3x8', 'tower-5x4']);
    expect(INCIDENT_PLAN_NAMES).toEqual(['highrise-12x9', 'highrise-12x9-instrumented']);
    expect(ALL_PLAN_NAMES).toEqual([...PLAN_NAMES, ...INCIDENT_PLAN_NAMES]);
    expect(isPlanName('__proto__')).toBe(false);
    expect(() => loadPlan('nope')).toThrow(/highrise-12x9/);
  });

  it('refuses a spec whose edges name a zone that does not exist', () => {
    expect(() => makeHighrisePlans({ ...spec, sameLevelEdges: [{ a: 'A1', b: 'ZZ', kind: 'door', rate: 0.1 }] })).toThrow(/unknown zone ZZ/);
    expect(() => makeHighrisePlans({ ...spec, verticalEdges: [{ zone: 'ZZ', kind: 'shaft', rate: 0.1 }] })).toThrow(/unknown zone ZZ/);
  });
});
