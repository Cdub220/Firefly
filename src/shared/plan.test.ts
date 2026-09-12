import { describe, expect, it } from 'vitest';
import { instantiateSpaces, validatePlan } from './plan';
import demo from '../../data/structures/demo-6.json';
import type { StructurePlan } from './types';

const plan = demo as StructurePlan;

describe('structure plan', () => {
  it('demo-6 validates', () => {
    expect(() => validatePlan(plan)).not.toThrow();
  });
  it('derives adjacency from edges', () => {
    const spaces = instantiateSpaces(plan);
    const s2 = spaces.find((s) => s.id === 'S2')!;
    expect(s2.neighbors.sort()).toEqual(['S1', 'S3', 'S5']);
    expect(s2.above).toBeNull();
    expect(spaces.find((s) => s.id === 'S3')!.burning).toBe(true);
  });
  it('rejects a dangling edge', () => {
    const bad: StructurePlan = { ...plan, edges: [...plan.edges, { a: 'S1', b: 'NOPE', kind: 'door', rate: 0.1 }] };
    expect(() => validatePlan(bad)).toThrow(/bad edge/);
  });
});
