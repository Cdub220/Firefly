import { describe, expect, it } from 'vitest';
import { DEFAULT_CORRUPTION } from '../corruption';
import { CORRUPTION_KEYS, CORRUPTION_SCHEMA, MODES } from './corruptionSchema';

describe('corruption schema', () => {
  it('lists exactly the keys the exhaustiveness check names, once each', () => {
    const schemaKeys = CORRUPTION_SCHEMA.map((f) => f.key);
    expect([...schemaKeys].sort()).toEqual([...CORRUPTION_KEYS].sort());
    expect(new Set(schemaKeys).size).toBe(schemaKeys.length);
  });

  it('every DEFAULT_CORRUPTION key is in the schema, and every numeric schema key has a default', () => {
    const defaults = Object.keys(DEFAULT_CORRUPTION);
    const schemaKeys = CORRUPTION_SCHEMA.map((f) => f.key);
    for (const k of defaults) expect(schemaKeys).toContain(k);
    // mode and target have no numeric default (mode is required, target omitted = any).
    const numeric = CORRUPTION_SCHEMA.filter((f) => f.kind === 'int' || f.kind === 'number').map((f) => f.key);
    expect([...numeric].sort()).toEqual([...defaults].sort());
  });

  it('numeric ranges contain their defaults and the enum lists every mode', () => {
    for (const f of CORRUPTION_SCHEMA) {
      if (f.kind === 'int' || f.kind === 'number') {
        const d = (DEFAULT_CORRUPTION as Record<string, number>)[f.key];
        expect(d).toBeGreaterThanOrEqual(f.min);
        expect(d).toBeLessThanOrEqual(f.max);
        expect(f.step).toBeGreaterThan(0);
      }
      if (f.kind === 'enum') {
        // labels is Record<CorruptionMode, string>, which tsc keeps complete; values must match it.
        expect([...f.values].sort()).toEqual(Object.keys(f.labels).sort());
        expect([...MODES].sort()).toEqual(Object.keys(f.labels).sort());
        for (const m of f.values) expect(f.labels[m]).toBeTruthy();
      }
    }
  });
});
