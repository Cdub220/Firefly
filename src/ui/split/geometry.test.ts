/**
 * Level-aware layout: bands top-down, vertical edges vertical, no overlapping cells, and
 * the six-space ring rendered byte-for-byte as before (snapshot of demo-6 tick 40).
 */
import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoopMulti } from '../../loop';
import { createBrain } from '../../brain';
import { createKalmanBrain } from '../../brain/kalman';
import { buildViewerData } from '../../eval/viewerData';
import { layoutPlan } from '../../eval/layout';
import { makeGridFixture } from '../../eval/fixtures';
import { brainSvg, fonts, geometry, legendText, truthSvg } from './svg';
import type { StructurePlan } from '../../shared/types';

const corruption = { mode: 'freeze' as const, k: 1, onset: 5, target: ['S3'] };
const run = (plan: StructurePlan, ticks = 60) => {
  const traces = runLoopMulti({ plan, seed: 42, ticks, corruption: { ...corruption, target: [plan.ignition[0]!] }, brains: { ours: createBrain, kalman: createKalmanBrain }, primary: 'ours' });
  return buildViewerData(plan, traces, { seed: 42, corruption });
};

const overlaps = (g: ReturnType<typeof layoutPlan>): number => {
  const ids = Object.keys(g.pos);
  let n = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = g.pos[ids[i]!]!, b = g.pos[ids[j]!]!;
      if (Math.abs(a.x - b.x) < g.CW && Math.abs(a.y - b.y) < g.CH) n++;
    }
  }
  return n;
};

describe('layoutPlan', () => {
  const grid24 = makeGridFixture({ levels: 3, rows: 2, cols: 4 });
  const g24 = layoutPlan(grid24);

  it('groups spaces into level bands ordered top-down, highest level on top, each labelled LEVEL n', () => {
    expect(g24.bands.map((b) => b.level)).toEqual([3, 2, 1]);
    expect(g24.bands.map((b) => b.label)).toEqual(['LEVEL 3', 'LEVEL 2', 'LEVEL 1']);
    for (let i = 1; i < g24.bands.length; i++) expect(g24.bands[i]!.y).toBeGreaterThan(g24.bands[i - 1]!.y + g24.bands[i - 1]!.h);
    for (const s of grid24.spaces) {
      const band = g24.bands.find((b) => b.level === s.level)!;
      const p = g24.pos[s.id]!;
      expect(p.y).toBeGreaterThanOrEqual(band.y);
      expect(p.y + g24.CH).toBeLessThanOrEqual(band.y + band.h);
    }
    expect(g24.labelW).toBeGreaterThan(0);
  });

  it('spaces joined by a floor or shaft edge share x, so vertical edges are vertical', () => {
    for (const e of grid24.edges) {
      if (e.kind !== 'floor' && e.kind !== 'shaft') continue;
      expect(g24.pos[e.a]!.x).toBe(g24.pos[e.b]!.x);
    }
    // One connector per column per gap; the shaft column is marked as such.
    expect(g24.vertical.length).toBe(4 * 2);
    expect(g24.vertical.filter((v) => v.kind === 'shaft').length).toBe(2);
    for (const v of g24.vertical) expect(v.y2).toBeGreaterThan(v.y1);
  });

  it('a 24-space plan has no overlapping cells, renders at ~70% with the temperature still >= 16px', () => {
    expect(overlaps(g24)).toBe(0);
    expect(g24.scale).toBeCloseTo(0.7, 5);
    expect(fonts(g24).temp).toBeGreaterThanOrEqual(16);
    expect(g24.labelEdges).toBe(false);
    const data = run(grid24, 12);
    expect(legendText(data)).toContain('shaft');
    const svg = brainSvg(data, geometry(data), data.ticks[11]!, 'ours');
    expect(svg).toContain('LEVEL 3');
    expect(svg).toContain('class="edge shaft"');
    expect(svg).not.toContain('door 0.15'); // no edge labels on a large plan
    expect(svg).toContain(`font-size="${fonts(g24).temp}px"`); // scaled temperature (17px at 0.7), floored at 16
  });

  it('non-generator ids: BFS order over same-level edges, and a space takes the column of its partner below', () => {
    const plan = {
      spaces: [{ id: 'store', level: 1 }, { id: 'hangar', level: 1 }, { id: 'galley', level: 1 }, { id: 'bridge', level: 2 }, { id: 'cabin', level: 2 }],
      edges: [
        { a: 'hangar', b: 'galley', kind: 'door' as const, rate: 0.15 },
        { a: 'galley', b: 'store', kind: 'bulkhead' as const, rate: 0.05 },
        { a: 'store', b: 'bridge', kind: 'floor' as const, rate: 0.08 },
        { a: 'bridge', b: 'cabin', kind: 'passage' as const, rate: 0.2 },
      ],
    };
    const g = layoutPlan(plan);
    // BFS from the lowest id ("galley"): galley, hangar, store -> columns 0, 1, 2.
    expect(g.pos['galley']!.x).toBeLessThan(g.pos['hangar']!.x);
    expect(g.pos['hangar']!.x).toBeLessThan(g.pos['store']!.x);
    expect(g.pos['bridge']!.x).toBe(g.pos['store']!.x);
    expect(g.pos['bridge']!.y).toBeLessThan(g.pos['store']!.y); // level 2 above level 1
    expect(overlaps(g)).toBe(0);
    expect(layoutPlan(plan)).toEqual(g); // deterministic
  });

  it('a 20-space five-level plan and a single space both lay out without overlap', () => {
    const g20 = layoutPlan(makeGridFixture({ levels: 5, rows: 2, cols: 2 }));
    expect(g20.bands.length).toBe(5);
    expect(overlaps(g20)).toBe(0);
    const g1 = layoutPlan({ spaces: [{ id: 'X', level: 1 }], edges: [] });
    expect(g1.pos['X']).toEqual({ x: 12, y: 12 });
    expect(g1.bands).toEqual([]);
  });
});

describe('six-space ring', () => {
  it('demo-6 at tick 40 renders exactly as before the level-aware layout (snapshot)', () => {
    const data = run(DEMO_PLAN);
    const g = geometry(data);
    expect(g.scale).toBe(1);
    expect(g.bands).toEqual([]);
    expect({ W: g.W, H: g.H, CW: g.CW, CH: g.CH }).toEqual({ W: 420, H: 258, CW: 104, CH: 100 });
    expect(g.pos).toEqual({ S1: { x: 12, y: 12 }, S2: { x: 158, y: 12 }, S3: { x: 304, y: 12 }, S6: { x: 12, y: 146 }, S5: { x: 158, y: 146 }, S4: { x: 304, y: 146 } });
    const rec = data.ticks[39]!;
    expect(rec.t).toBe(40);
    expect(truthSvg(data, g, rec)).toMatchSnapshot();
    expect(brainSvg(data, g, rec, 'ours')).toMatchSnapshot();
    expect(brainSvg(data, g, rec, 'kalman')).toMatchSnapshot();
  });
});

describe('awkward plan shapes', () => {
  it('a tall tower (5 levels of 2x2) is flattened to one row per level so the panel is not several screens tall', () => {
    const tower = makeGridFixture({ levels: 5, rows: 2, cols: 2 });
    const g = layoutPlan(tower);
    expect(g.H / g.W).toBeLessThanOrEqual(1.6);
    expect(g.bands.length).toBe(5);
    expect(overlaps(g)).toBe(0);
    for (const e of tower.edges) {
      if (e.kind === 'floor' || e.kind === 'shaft') expect(g.pos[e.a]!.x).toBe(g.pos[e.b]!.x);
    }
    for (const v of g.vertical) expect(v.x1).toBe(v.x2);
    // A wide plan is not flattened: three levels of 2x4 keep their two rows.
    const wide = layoutPlan(makeGridFixture({ levels: 3, rows: 2, cols: 4 }));
    expect(wide.bands[0]!.h).toBeGreaterThan(wide.CH);
  });

  it('several upper spaces sharing one partner below: connectors run to the partner, none dangle', () => {
    const plan = {
      spaces: [{ id: 'hold', level: 1 }, { id: 'r1', level: 2 }, { id: 'r2', level: 2 }, { id: 'r5', level: 2 }],
      edges: [
        { a: 'hold', b: 'r1', kind: 'floor' as const, rate: 0.08 },
        { a: 'hold', b: 'r2', kind: 'floor' as const, rate: 0.08 },
        { a: 'hold', b: 'r5', kind: 'shaft' as const, rate: 0.3 },
        { a: 'r1', b: 'r2', kind: 'door' as const, rate: 0.15 },
      ],
    };
    const g = layoutPlan(plan);
    expect(overlaps(g)).toBe(0);
    const holdX = g.pos['hold']!.x + g.CW / 2;
    expect(g.vertical.length).toBe(3);
    for (const v of g.vertical) expect(v.x2).toBe(holdX); // every connector ends on the partner
    expect(g.vertical.some((v) => v.x1 === holdX)).toBe(true); // one inherited the column
    expect(g.vertical.filter((v) => v.kind === 'shaft').length).toBe(1);
  });

  it('a zero-space plan and Object.prototype ids do not throw', () => {
    const empty = layoutPlan({ spaces: [], edges: [] });
    expect(empty.W).toBeGreaterThan(0);
    expect(empty.H).toBeGreaterThan(0);
    expect(empty.pos).toEqual({});
    const odd = layoutPlan({ spaces: ['constructor', 'toString', 'S1', 'S2', 'S3', 'S4'].map((id) => ({ id, level: 1 })), edges: [] });
    expect(Object.keys(odd.pos).sort()).toEqual(['S1', 'S2', 'S3', 'S4', 'constructor', 'toString']);
    expect(overlaps(odd)).toBe(0);
  });
});

describe('round-3 regressions', () => {
  it('no same-level edge is drawn straight through a third cell: flattened cross-row passages become detours', () => {
    const tower = makeGridFixture({ levels: 5, rows: 2, cols: 2 });
    const g = layoutPlan(tower);
    // Every A-B passage on a flattened band is a detour; doors between adjacent cells are not.
    const passages = tower.edges.filter((e) => e.kind === 'passage');
    expect(g.detours.length).toBe(passages.length);
    for (const p of passages) expect(g.detours.some((d) => d.a === p.a && d.b === p.b)).toBe(true);
    // And the renderer draws them as brackets, not lines.
    const data = run(tower, 8);
    const svg = brainSvg(data, geometry(data), data.ticks[7]!, 'ours');
    expect((svg.match(/<path class="edge passage"/g) ?? []).length).toBe(passages.length);
    expect(svg).not.toContain('<line class="edge passage"');
    expect(legendText(data)).toContain('bracket');
    // A wide plan has no detours and no brackets.
    const wide = makeGridFixture({ levels: 3, rows: 2, cols: 4 });
    expect(layoutPlan(wide).detours).toEqual([]);
  });

  it('flattening uses one column count across levels, so floor edges stay vertical when grid widths differ', () => {
    const plan = {
      spaces: [
        { id: 'L1-A1', level: 1 }, { id: 'L1-A2', level: 1 }, { id: 'L1-B1', level: 1 }, { id: 'L1-B2', level: 1 },
        { id: 'L2-A1', level: 2 }, { id: 'L2-A2', level: 2 }, { id: 'L2-A3', level: 2 }, { id: 'L2-B1', level: 2 }, { id: 'L2-B2', level: 2 }, { id: 'L2-B3', level: 2 },
        { id: 'L3-A1', level: 3 }, { id: 'L3-A2', level: 3 }, { id: 'L3-B1', level: 3 }, { id: 'L3-B2', level: 3 },
        { id: 'L4-A1', level: 4 }, { id: 'L4-A2', level: 4 }, { id: 'L4-B1', level: 4 }, { id: 'L4-B2', level: 4 },
        { id: 'L5-A1', level: 5 }, { id: 'L5-A2', level: 5 }, { id: 'L5-B1', level: 5 }, { id: 'L5-B2', level: 5 },
        { id: 'L6-A1', level: 6 }, { id: 'L6-A2', level: 6 }, { id: 'L6-B1', level: 6 }, { id: 'L6-B2', level: 6 },
      ],
      edges: [
        { a: 'L1-A1', b: 'L2-A1', kind: 'floor' as const, rate: 0.08 }, { a: 'L1-B2', b: 'L2-B2', kind: 'floor' as const, rate: 0.08 },
        { a: 'L2-B2', b: 'L3-B2', kind: 'floor' as const, rate: 0.08 }, { a: 'L3-A1', b: 'L4-A1', kind: 'floor' as const, rate: 0.08 },
        { a: 'L4-B2', b: 'L5-B2', kind: 'floor' as const, rate: 0.08 }, { a: 'L5-B1', b: 'L6-B1', kind: 'shaft' as const, rate: 0.3 },
      ],
    };
    const g = layoutPlan(plan);
    expect(g.bands[0]!.h).toBe(g.CH); // flattened
    for (const e of plan.edges) expect(g.pos[e.a]!.x).toBe(g.pos[e.b]!.x);
    expect(overlaps(g)).toBe(0);
  });

  it('skip-level vertical edges each get their own connector; a same-level floor edge is drawn as a line', () => {
    const plan = {
      spaces: [{ id: 'a', level: 1 }, { id: 'b', level: 2 }, { id: 'c', level: 3 }, { id: 'd', level: 3 }],
      edges: [
        { a: 'c', b: 'a', kind: 'shaft' as const, rate: 0.3 }, // skips level 2
        { a: 'c', b: 'b', kind: 'floor' as const, rate: 0.08 },
        { a: 'c', b: 'd', kind: 'floor' as const, rate: 0.08 }, // malformed: same level; still visible
      ],
    };
    const g = layoutPlan(plan);
    expect(g.vertical.length).toBe(2);
    const data = run({ ...plan, name: 'skip', ambient: 22, sensors: [{ id: 'F', spaceId: 'a' }], resupply: ['a'], ignition: ['a'] }, 3);
    const svg = truthSvg(data, geometry(data), data.ticks[2]!);
    expect((svg.match(/class="edge floor"/g) ?? []).length).toBe(2); // one connector, one same-level line
  });
});

describe('round-4 regressions (bracket clipping)', () => {
  it('every bracket, including those under the bottom band, lies inside the canvas', () => {
    for (const plan of [makeGridFixture({ levels: 5, rows: 2, cols: 2 }), makeGridFixture({ levels: 6, rows: 3, cols: 2 }), makeGridFixture({ levels: 8, rows: 3, cols: 3 })]) {
      const g = layoutPlan(plan);
      expect(g.detours.length).toBeGreaterThan(0);
      for (const d of g.detours) {
        const y = Math.max(g.pos[d.a]!.y, g.pos[d.b]!.y) + g.CH + d.depth;
        expect(y).toBeLessThanOrEqual(g.H - 2);
      }
      // Lanes restart on every level: the first bracket of each band is at the shallowest depth.
      const levelOf = new Map(plan.spaces.map((s) => [s.id, s.level]));
      const firstPerLevel = new Map<number, number>();
      for (const d of g.detours) {
        const l = levelOf.get(d.a)!;
        if (!firstPerLevel.has(l)) firstPerLevel.set(l, d.depth);
      }
      for (const depth of firstPerLevel.values()) expect(depth).toBe(12);
    }
    const data = run(makeGridFixture({ levels: 5, rows: 2, cols: 2 }), 4);
    const g = geometry(data);
    const svg = truthSvg(data, g, data.ticks[3]!);
    for (const m of svg.matchAll(/ V(\d+(?:\.\d+)?) H/g)) expect(Number(m[1])).toBeLessThanOrEqual(g.H - 2);
  });

  it('flattening never produces a ribbon: a wide two-level plan keeps its rows', () => {
    const g = layoutPlan(makeGridFixture({ levels: 2, rows: 4, cols: 4 }));
    expect(g.W / g.H).toBeLessThanOrEqual(3);
    expect(g.bands[0]!.h).toBeGreaterThan(g.CH); // not flattened
  });
});
