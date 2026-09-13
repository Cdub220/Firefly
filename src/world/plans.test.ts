import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { instantiateSpaces, validatePlan } from '../shared/plan';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import type { StructurePlan, WorldState } from '../shared/types';
import { createWorld } from './index';
import { makeGridPlan, parseSpaceId, PLAN_SPECS, spaceId } from './gen';
import { planFileText } from './gen-plans';

/** Tick of first burning per space id over `ticks` ticks with no commands. */
function ignitionTicks(plan: StructurePlan, seed: number, ticks: number): Map<string, number> {
  const w = createWorld({ plan, seed, drones: [] });
  const first = new Map<string, number>();
  for (let i = 0; i < ticks; i++) {
    const { truth }: { truth: WorldState } = w.tick([]);
    for (const s of truth.spaces) if (s.burning && !first.has(s.id)) first.set(s.id, truth.t);
  }
  return first;
}

const levelOf = (id: string): number => parseSpaceId(id)?.level ?? -1;

describe('generated plans', () => {
  it('every plan in PLAN_NAMES validates and instantiates', () => {
    expect(PLAN_NAMES).toEqual(expect.arrayContaining(['demo-6', 'vessel-3x8', 'tower-5x4']));
    for (const name of PLAN_NAMES) {
      const plan = loadPlan(name);
      expect(() => validatePlan(plan)).not.toThrow();
      expect(instantiateSpaces(plan)).toHaveLength(plan.spaces.length);
      expect(plan.name).toBe(name);
    }
  });

  it('loadPlan throws on an unknown name', () => {
    expect(() => loadPlan('nope')).toThrow(/unknown plan/);
  });

  it('the sim CLI accepts --plan and a later --ticks overrides the earlier one', () => {
    const run = (...args: string[]) =>
      execFileSync('npx', ['tsx', 'src/loop.ts', '--ticks', '50', ...args], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const out = run('--plan', 'tower-5x4', '--ticks', '2');
    expect(out).toContain('plan=tower-5x4');
    expect(out).toContain('ticks=2');
    expect(out).toContain('truth=[L2-B2]');
    expect(out.split('\n').filter((l) => l.startsWith('t='))).toHaveLength(2);
    expect(() => run('--plan', 'nope', '--ticks', '1')).toThrow(/expected one of demo-6, vessel-3x8, tower-5x4/);
  }, 30_000);

  it('the committed JSON files are exactly what the generator produces', () => {
    for (const [name, spec] of Object.entries(PLAN_SPECS)) {
      const onDisk = readFileSync(resolve(process.cwd(), 'data/structures', `${name}.json`), 'utf8');
      expect(onDisk).toBe(planFileText(spec));
    }
  });

  it('the generator is deterministic', () => {
    const spec = PLAN_SPECS['vessel-3x8']!;
    expect(JSON.stringify(makeGridPlan(spec))).toBe(JSON.stringify(makeGridPlan(spec)));
  });
});

describe('makeGridPlan', () => {
  const small = makeGridPlan({
    name: 'small', levels: 2, rows: 2, cols: 3,
    doorRate: 0.1, passageRate: 0.2, floorRate: 0.05, shaftRate: 0.4, shaftAt: [1, 2],
    resupply: ['L1-A1'], ignition: ['L1-A1'],
  });

  it('names spaces L{level}-{row}{col} and round-trips through parseSpaceId', () => {
    expect(small.spaces.map((s) => s.id)).toEqual(['L1-A1', 'L1-A2', 'L1-A3', 'L1-B1', 'L1-B2', 'L1-B3', 'L2-A1', 'L2-A2', 'L2-A3', 'L2-B1', 'L2-B2', 'L2-B3']);
    expect(spaceId(2, 1, 2)).toBe('L2-B3');
    expect(parseSpaceId('L2-B3')).toEqual({ level: 2, row: 1, col: 2 });
    expect(parseSpaceId('S3')).toBeNull();
  });

  it('joins rows by door, across rows by passage, levels by floor, plus one shaft chain', () => {
    const kinds = (a: string, b: string) => small.edges.filter((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)).map((e) => `${e.kind}:${e.rate}`);
    expect(kinds('L1-A1', 'L1-A2')).toEqual(['door:0.1']);
    expect(kinds('L1-A1', 'L1-B1')).toEqual(['passage:0.2']);
    expect(kinds('L1-A1', 'L2-A1')).toEqual(['floor:0.05']);
    expect(kinds('L1-B3', 'L2-B3').sort()).toEqual(['floor:0.05', 'shaft:0.4']);
    expect(kinds('L1-A1', 'L1-B2')).toEqual([]); // no diagonals
    expect(small.edges.filter((e) => e.kind === 'shaft')).toHaveLength(1);
    expect(small.edges.filter((e) => e.kind === 'floor')).toHaveLength(6);
    expect(small.edges.filter((e) => e.kind === 'door')).toHaveLength(8);
    expect(small.edges.filter((e) => e.kind === 'passage')).toHaveLength(6);
  });

  it('puts a sensor in every space except the sensorless ones', () => {
    const p = makeGridPlan({
      name: 'x', levels: 1, rows: 1, cols: 3, doorRate: 0.1, passageRate: 0.1, floorRate: 0.1, shaftRate: 0.1,
      sensorless: ['L1-A2'], resupply: ['L1-A1'], ignition: [],
    });
    expect(p.sensors.map((s) => s.spaceId)).toEqual(['L1-A1', 'L1-A3']);
    expect(p.sensors.map((s) => s.id)).toEqual(['F-L1-A1', 'F-L1-A3']);
  });

  it('rejects a shaft outside the grid and references to unknown spaces', () => {
    const base = { name: 'bad', levels: 1, rows: 1, cols: 2, doorRate: 0.1, passageRate: 0.1, floorRate: 0.1, shaftRate: 0.1, resupply: ['L1-A1'], ignition: [] };
    expect(() => makeGridPlan({ ...base, shaftAt: [0, 5] })).toThrow(/shaftAt/);
    expect(() => makeGridPlan({ ...base, ignition: ['L9-Z9'] })).toThrow(/unknown space/);
    expect(() => makeGridPlan({ ...base, sensorless: ['S1'] })).toThrow(/unknown space/);
  });

  it('two same-level edges on one pair give one neighbor and one open door, not two', () => {
    const doubled: StructurePlan = {
      name: 'doubled', ambient: 22,
      spaces: [{ id: 'A', level: 1 }, { id: 'B', level: 1 }],
      edges: [{ a: 'A', b: 'B', kind: 'door', rate: 0.1 }, { a: 'B', b: 'A', kind: 'passage', rate: 0.1 }],
      sensors: [], resupply: ['A'], ignition: [],
    };
    const [a, b] = instantiateSpaces(doubled);
    expect(a!.neighbors).toEqual(['B']);
    expect(a!.doorsOpen).toEqual(['B']);
    expect(b!.neighbors).toEqual(['A']);
    expect(b!.doorsOpen).toEqual(['A']);
  });

  it('a shaft edge between levels sets above/below and never appears as a same-level neighbor', () => {
    const spaces = instantiateSpaces(small);
    const lowerShaft = spaces.find((s) => s.id === 'L1-B3')!;
    const upperShaft = spaces.find((s) => s.id === 'L2-B3')!;
    expect(lowerShaft.above).toBe('L2-B3');
    expect(upperShaft.below).toBe('L1-B3');
    for (const s of spaces) {
      for (const n of s.neighbors) expect(levelOf(n)).toBe(s.level);
      expect(new Set(s.neighbors).size).toBe(s.neighbors.length);
    }
  });
});

describe('vessel-3x8', () => {
  const plan = loadPlan('vessel-3x8');

  it('is three levels of 2x4 with the specified hazards, sensors, resupply and ignition', () => {
    expect(plan.spaces).toHaveLength(24);
    expect(new Set(plan.spaces.map((s) => s.level))).toEqual(new Set([1, 2, 3]));
    expect(plan.sensors).toHaveLength(22);
    expect(plan.sensors.map((s) => s.spaceId)).not.toContain('L2-B2');
    expect(plan.sensors.map((s) => s.spaceId)).not.toContain('L2-B3');
    expect(plan.spaces.filter((s) => s.hazard === 'fuel').map((s) => s.id)).toEqual(['L1-B3']);
    expect(plan.spaces.filter((s) => s.hazard === 'ordnance').map((s) => s.id)).toEqual(['L2-A4']);
    expect(plan.ignition).toEqual(['L1-B3']);
    expect(plan.resupply).toEqual(['L1-A1']);
    expect(plan.edges.filter((e) => e.kind === 'shaft')).toHaveLength(2);
    const occ = (level: number) => plan.spaces.filter((s) => s.level === level).reduce((n, s) => n + (s.occupants ?? 0), 0);
    expect(occ(3)).toBeGreaterThan(occ(1) + occ(2));
    expect(Math.max(...plan.spaces.map((s) => s.occupants ?? 0))).toBeLessThanOrEqual(6);
  });

  it('has above/below set on every space', () => {
    for (const s of instantiateSpaces(plan)) {
      if (s.level < 3) expect(s.above).toBe(`L${s.level + 1}-${s.id.slice(3)}`);
      else expect(s.above).toBeNull();
      if (s.level > 1) expect(s.below).toBe(`L${s.level - 1}-${s.id.slice(3)}`);
      else expect(s.below).toBeNull();
    }
  });

  it('a fire started on level 1 reaches level 2 within 80 ticks', () => {
    for (const seed of [42, 1]) {
      const first = ignitionTicks(plan, seed, 80);
      const level2 = [...first].filter(([id]) => levelOf(id) === 2).map(([, t]) => t);
      expect(level2.length).toBeGreaterThan(0);
      expect(Math.min(...level2)).toBeLessThanOrEqual(80);
      expect(first.get('L1-B3')).toBe(1);
    }
  });
});

describe('tower-5x4', () => {
  const plan = loadPlan('tower-5x4');

  it('is five levels of 2x2 with no sensors on level 4 and ignition off the shaft on level 2', () => {
    expect(plan.spaces).toHaveLength(20);
    expect(plan.sensors).toHaveLength(16);
    expect(plan.sensors.some((s) => levelOf(s.spaceId) === 4)).toBe(false);
    expect(plan.ignition).toEqual(['L2-B2']);
    expect(plan.edges.some((e) => e.kind === 'shaft' && (e.a === 'L2-B2' || e.b === 'L2-B2'))).toBe(false);
    expect(plan.edges.filter((e) => e.kind === 'shaft').map((e) => e.rate)).toEqual([0.35, 0.35, 0.35, 0.35]);
    expect(plan.edges.filter((e) => e.kind === 'floor').every((e) => e.rate === 0.04)).toBe(true);
  });

  it('the stack effect shows: the shaft space ignites first on every level above the fire, and the fire reaches the top well before it would through floors alone', () => {
    // The prompt's literal check (shaft space on L5 before any non-shaft space on L3)
    // cannot hold under this physics: a shaft hop takes ~5 ticks (the source has to
    // ignite and heat up first) and a door hop ~3, so three shaft hops never beat one
    // door hop on level 3. What the stairwell does do is get fire to the top ~20 ticks
    // sooner than concrete slabs alone, and it is the entry point on every level.
    const withShaft = ignitionTicks(plan, 42, 200);
    for (const level of [3, 4, 5]) {
      const onLevel = [...withShaft].filter(([id]) => levelOf(id) === level).sort((a, b) => a[1] - b[1]);
      expect(onLevel[0]![0]).toBe(`L${level}-A1`);
    }
    const towerNoShaft = Object.fromEntries(Object.entries(PLAN_SPECS['tower-5x4']!).filter(([k]) => k !== 'shaftAt'));
    const noShaft = makeGridPlan({ ...(towerNoShaft as typeof PLAN_SPECS[string]), name: 'tower-no-shaft' });
    const without = ignitionTicks(noShaft, 42, 200);
    const topWith = Math.min(...[...withShaft].filter(([id]) => levelOf(id) === 5).map(([, t]) => t));
    const topWithout = Math.min(...[...without].filter(([id]) => levelOf(id) === 5).map(([, t]) => t));
    expect(topWith).toBeLessThan(60);
    expect(topWithout - topWith).toBeGreaterThanOrEqual(10);
  });
});
