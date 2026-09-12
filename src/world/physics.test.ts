import { describe, expect, it } from 'vitest';
import { makeRng } from '../shared/rng';
import { instantiateSpaces } from '../shared/plan';
import type { StructurePlan, WorldState } from '../shared/types';
import demo from '../../data/structures/demo-6.json';
import { createWorld } from './index';
import { stepPhysics } from './physics';
import {
  BURN, CHEMICAL_COOL_MULT, CLOSED_DOOR_LEAK, COOL, FLAME_TEMP, FUEL_HAZARD_MULT, GEN_RATE, IGNITE,
  MAX_OUTGOING_RATE, ORDNANCE_COOKOFF_HEAT,
} from './constants';

const DEMO = demo as StructurePlan;

/** Run a world for `ticks` with no commands and return every truth snapshot. */
function run(plan: StructurePlan, seed: number, ticks: number): WorldState[] {
  const w = createWorld({ plan, seed });
  const out: WorldState[] = [];
  for (let i = 0; i < ticks; i++) out.push(w.tick([]).truth);
  return out;
}

const burningIds = (s: WorldState): string[] => s.spaces.filter((x) => x.burning).map((x) => x.id);

/** First tick at which `id` is burning, or Infinity. */
function firstBurn(trace: WorldState[], id: string): number {
  const rec = trace.find((s) => s.spaces.find((x) => x.id === id)?.burning);
  return rec ? rec.t : Infinity;
}

/** A tiny plan: A ignites; B is behind a door, C behind a bulkhead, same path length. */
const TRI: StructurePlan = {
  name: 'tri',
  ambient: 22,
  spaces: [
    { id: 'A', level: 1 },
    { id: 'B', level: 1 },
    { id: 'C', level: 1 },
  ],
  edges: [
    { a: 'A', b: 'B', kind: 'door', rate: 0.15 },
    { a: 'A', b: 'C', kind: 'bulkhead', rate: 0.05 },
  ],
  sensors: [],
  resupply: ['B'],
  ignition: ['A'],
};

/** Build a WorldState from a plan, with optional per-space overrides. */
function stateOf(plan: StructurePlan, patch: Record<string, Partial<WorldState['spaces'][number]>> = {}): WorldState {
  const spaces = instantiateSpaces(plan).map((s) => ({ ...s, ...(patch[s.id] ?? {}) }));
  return { t: 0, spaces, drones: [] };
}

describe('fire physics on demo-6', () => {
  it('the burning set grows beyond the ignition space within 30 ticks', () => {
    const trace = run(DEMO, 42, 30);
    const last = trace[trace.length - 1]!;
    expect(burningIds(last).length).toBeGreaterThan(DEMO.ignition.length);
    expect(burningIds(last)).toEqual(expect.arrayContaining(DEMO.ignition));
  });

  it('fuel decreases monotonically in a burning space and burning stops at zero', () => {
    const trace = run(DEMO, 42, 200);
    let prev = 1;
    let zeroAt = Infinity;
    for (const s of trace) {
      const s3 = s.spaces.find((x) => x.id === 'S3')!;
      expect(s3.fuel).toBeLessThanOrEqual(prev);
      prev = s3.fuel;
      if (s3.fuel === 0 && zeroAt === Infinity) zeroAt = s.t;
      if (s3.fuel === 0) expect(s3.burning).toBe(false);
      if (s.t < zeroAt) expect(s3.burning).toBe(true);
    }
    expect(zeroAt).toBeLessThan(200);
  });

  it('no temperature is ever NaN or negative over 200 ticks', () => {
    for (const seed of [42, 7, 123]) {
      for (const s of run(DEMO, seed, 200)) {
        for (const sp of s.spaces) {
          expect(Number.isFinite(sp.temp)).toBe(true);
          expect(sp.temp).toBeGreaterThanOrEqual(0);
          expect(sp.fuel).toBeGreaterThanOrEqual(0);
          expect(sp.fuel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('same seed gives a JSON-identical 100-tick truth trace', () => {
    expect(JSON.stringify(run(DEMO, 42, 100))).toBe(JSON.stringify(run(DEMO, 42, 100)));
    expect(JSON.stringify(run(DEMO, 42, 100))).not.toBe(JSON.stringify(run(DEMO, 43, 100)));
  });

  it('every ignition after t=0 has a burning neighbor or happened above IGNITE', () => {
    const trace = run(DEMO, 1, 120);
    for (let i = 1; i < trace.length; i++) {
      const prev = trace[i - 1]!;
      const cur = trace[i]!;
      for (const s of cur.spaces) {
        const was = prev.spaces.find((x) => x.id === s.id)!;
        if (s.burning && !was.burning) expect(was.temp).toBeGreaterThanOrEqual(IGNITE);
      }
    }
  });
});

describe('heat paths', () => {
  it('fire reaches a space through an open door strictly before one through a bulkhead', () => {
    const trace = run(TRI, 1, 100);
    const viaDoor = firstBurn(trace, 'B');
    const viaBulkhead = firstBurn(trace, 'C');
    expect(viaDoor).toBeLessThan(viaBulkhead);
    expect(viaBulkhead).toBeLessThan(Infinity);
  });

  it('a closed door leaks at CLOSED_DOOR_LEAK times its rate', () => {
    const open = stateOf(TRI, { A: { temp: 422, burning: false, fuel: 0 } });
    const closed = stateOf(TRI, { A: { temp: 422, burning: false, fuel: 0 } });
    for (const s of closed.spaces) s.doorsOpen = [];
    const bOpen = stepPhysics(open, TRI, makeRng(1)).spaces.find((s) => s.id === 'B')!;
    const bClosed = stepPhysics(closed, TRI, makeRng(1)).spaces.find((s) => s.id === 'B')!;
    const expectOpen = 22 + 0.15 * 400;
    const expectClosed = 22 + 0.15 * CLOSED_DOOR_LEAK * 400;
    expect(bOpen.temp).toBeCloseTo(expectOpen + COOL * (22 - expectOpen), 6);
    expect(bClosed.temp).toBeCloseTo(expectClosed + COOL * (22 - expectClosed), 6);
  });

  it('a door open on only one side still counts as open', () => {
    const st = stateOf(TRI, { A: { temp: 422, burning: false, fuel: 0 } });
    st.spaces.find((s) => s.id === 'A')!.doorsOpen = [];
    const b = stepPhysics(st, TRI, makeRng(1)).spaces.find((s) => s.id === 'B')!;
    const expectOpen = 22 + 0.15 * 400;
    expect(b.temp).toBeCloseTo(expectOpen + COOL * (22 - expectOpen), 6);
  });

  it('fire climbs a floor edge to a second level and spreads there', () => {
    // demo-6 twice, each space joined to its twin above by a floor edge. This is the
    // checkpoint-2 plan shape; a model that only spreads on a sparse single level is useless.
    const two: StructurePlan = {
      name: 'two-level',
      ambient: DEMO.ambient,
      spaces: [...DEMO.spaces, ...DEMO.spaces.map((s) => ({ ...s, id: `${s.id}U`, level: 2 }))],
      edges: [
        ...DEMO.edges,
        ...DEMO.edges.map((e) => ({ ...e, a: `${e.a}U`, b: `${e.b}U` })),
        ...DEMO.spaces.map((s) => ({ a: s.id, b: `${s.id}U`, kind: 'floor' as const, rate: 0.08 })),
      ],
      sensors: [],
      resupply: ['S1'],
      ignition: ['S3'],
    };
    const trace = run(two, 1, 120);
    const upperEverBurned = DEMO.spaces.filter((s) => firstBurn(trace, `${s.id}U`) < Infinity);
    expect(firstBurn(trace, 'S3U')).toBeLessThan(Infinity);
    expect(upperEverBurned.length).toBeGreaterThanOrEqual(3);
  });

  it('clamps the sum of outgoing rates to MAX_OUTGOING_RATE so a hub never overshoots', () => {
    const n = 10;
    const hub: StructurePlan = {
      name: 'hub',
      ambient: 0,
      spaces: [{ id: 'H', level: 1 }, ...Array.from({ length: n }, (_, i) => ({ id: `N${i}`, level: 1 }))],
      edges: Array.from({ length: n }, (_, i) => ({ a: 'H', b: `N${i}`, kind: 'bulkhead' as const, rate: 0.15 })),
      sensors: [],
      resupply: ['N0'],
      ignition: [],
    };
    const st = stateOf(hub, { H: { temp: 1000, fuel: 0 } });
    const h = stepPhysics(st, hub, makeRng(1)).spaces.find((s) => s.id === 'H')!;
    // Unclamped: 1000 - 1.5 * 1000 < 0. Clamped: 1000 - 0.9 * 1000 = 100, then cooling toward 0.
    const expected = 1000 - MAX_OUTGOING_RATE * 1000;
    expect(h.temp).toBeCloseTo(expected + COOL * (0 - expected), 6);
    expect(h.temp).toBeGreaterThan(0);
  });
});

describe('generation, hazards, effects', () => {
  it('a burning space is pulled toward FLAME_TEMP and a suppression effect scales the pull', () => {
    const base = stateOf(TRI, { A: { temp: 300 } });
    const plain = stepPhysics(base, TRI, makeRng(1)).spaces.find((s) => s.id === 'A')!;
    const damped = stepPhysics(base, TRI, makeRng(1), { A: { suppression: 0.3, fuelDelta: 0 } })
      .spaces.find((s) => s.id === 'A')!;
    // A after transfer: 300 - 0.15*278 - 0.05*278 = 244.4. Generation gap = FLAME_TEMP - 244.4.
    const afterTransfer = 300 - 0.2 * 278;
    const gap = FLAME_TEMP - afterTransfer;
    expect(plain.temp - damped.temp).toBeCloseTo(GEN_RATE * 0.7 * gap * (1 - COOL), 6);
    // Suppression above 1 cannot amplify the fire.
    const over = stepPhysics(base, TRI, makeRng(1), { A: { suppression: 5, fuelDelta: 0 } })
      .spaces.find((s) => s.id === 'A')!;
    expect(over.temp).toBeCloseTo(plain.temp, 9);
  });

  it('a fuelDelta effect removes fuel and keeps it in [0, 1]', () => {
    const st = stateOf(TRI, { B: { fuel: 0.1 } });
    const next = stepPhysics(st, TRI, makeRng(1), { B: { suppression: 1, fuelDelta: -0.15 } });
    expect(next.spaces.find((s) => s.id === 'B')!.fuel).toBe(0);
  });

  it('a space with fuel at or below the ignition minimum does not ignite', () => {
    const st = stateOf(TRI, { B: { temp: 400, fuel: 0.2 } });
    const b = stepPhysics(st, TRI, makeRng(1)).spaces.find((s) => s.id === 'B')!;
    expect(b.burning).toBe(false);
  });

  it('ordnance cooks off once: neighbors get ORDNANCE_COOKOFF_HEAT and the hazard is spent', () => {
    // A starts at 520 so it is still >= ORDNANCE_COOKOFF_TEMP after losing heat to B and C.
    const st = stateOf(TRI, { A: { temp: 520, burning: false, fuel: 0, hazard: 'ordnance' } });
    const one = stepPhysics(st, TRI, makeRng(1));
    const a1 = one.spaces.find((s) => s.id === 'A')!;
    const c1 = one.spaces.find((s) => s.id === 'C')!;
    expect(a1.hazard).toBe('none');
    // C: bulkhead 0.05 * 498 transfer, cooling, then +150 from the cook-off.
    const pre = 22 + 0.05 * 498;
    expect(c1.temp).toBeCloseTo(pre + COOL * (22 - pre) + ORDNANCE_COOKOFF_HEAT, 6);
    const two = stepPhysics(one, TRI, makeRng(1));
    const c2 = two.spaces.find((s) => s.id === 'C')!;
    expect(c2.temp).toBeLessThan(c1.temp + ORDNANCE_COOKOFF_HEAT);
  });

  it('cook-off is decided on step-entry temps, so plan order and chaining cannot change it', () => {
    // A cooks off this tick. B is ordnance too and enters step 5 at ~353 C; A's +150 pushes
    // it past 400 but it must not cook until next tick, whichever order the plan lists them.
    const base = { A: { temp: 520, burning: false, fuel: 0, hazard: 'ordnance' as const },
      B: { temp: 300, burning: false, fuel: 0, hazard: 'ordnance' as const } };
    const fwd = stepPhysics(stateOf(TRI, base), TRI, makeRng(1));
    const revPlan: StructurePlan = { ...TRI, spaces: [...TRI.spaces].reverse() };
    const rev = stepPhysics(stateOf(revPlan, base), revPlan, makeRng(1));
    for (const id of ['A', 'B', 'C']) {
      expect(rev.spaces.find((s) => s.id === id)!.temp).toBeCloseTo(fwd.spaces.find((s) => s.id === id)!.temp, 9);
    }
    expect(fwd.spaces.find((s) => s.id === 'A')!.hazard).toBe('none');
    expect(fwd.spaces.find((s) => s.id === 'B')!.hazard).toBe('ordnance');
    expect(fwd.spaces.find((s) => s.id === 'B')!.temp).toBeGreaterThan(400);
    // C received exactly one cook-off.
    const preC = 22 + 0.05 * 498;
    expect(fwd.spaces.find((s) => s.id === 'C')!.temp).toBeCloseTo(preC + COOL * (22 - preC) + ORDNANCE_COOKOFF_HEAT, 6);
  });

  it('a fuel hazard burns fuel FUEL_HAZARD_MULT times faster', () => {
    const plain = stepPhysics(stateOf(TRI), TRI, makeRng(1)).spaces.find((s) => s.id === 'A')!;
    const fuelHaz = stepPhysics(stateOf(TRI, { A: { hazard: 'fuel' } }), TRI, makeRng(1))
      .spaces.find((s) => s.id === 'A')!;
    expect(1 - plain.fuel).toBeCloseTo(BURN, 9);
    expect(1 - fuelHaz.fuel).toBeCloseTo(BURN * FUEL_HAZARD_MULT, 9);
    expect(fuelHaz.temp).toBeGreaterThan(plain.temp);
  });

  it('a chemical hazard cools at CHEMICAL_COOL_MULT of the normal rate', () => {
    const lone: StructurePlan = {
      name: 'lone', ambient: 22, spaces: [{ id: 'X', level: 1 }], edges: [], sensors: [], resupply: ['X'], ignition: [],
    };
    const plain = stepPhysics(stateOf(lone, { X: { temp: 222, fuel: 0 } }), lone, makeRng(1)).spaces[0]!;
    const chem = stepPhysics(stateOf(lone, { X: { temp: 222, fuel: 0, hazard: 'chemical' } }), lone, makeRng(1)).spaces[0]!;
    expect(plain.temp).toBeCloseTo(222 - COOL * 200, 9);
    expect(chem.temp).toBeCloseTo(222 - COOL * CHEMICAL_COOL_MULT * 200, 9);
  });

  it('open doors in burning spaces eventually fail shut, symmetrically', () => {
    const trace = run(DEMO, 42, 200);
    const doorsAt = (s: WorldState): number => s.spaces.reduce((n, sp) => n + sp.doorsOpen.length, 0);
    expect(doorsAt(trace[trace.length - 1]!)).toBeLessThan(doorsAt(trace[0]!));
    for (const s of trace) {
      for (const sp of s.spaces) {
        for (const other of sp.doorsOpen) {
          expect(s.spaces.find((x) => x.id === other)!.doorsOpen).toContain(sp.id);
        }
      }
    }
  });

  it('a hot isolated space ignites spontaneously with no burning neighbor', () => {
    const lone: StructurePlan = {
      name: 'lone', ambient: 22, spaces: [{ id: 'X', level: 1 }], edges: [], sensors: [], resupply: ['X'], ignition: [],
    };
    let st = stateOf(lone, { X: { temp: 1000 } });
    const rng = makeRng(3);
    let litAt = Infinity;
    for (let i = 1; i <= 80 && litAt === Infinity; i++) {
      st = stepPhysics(st, lone, rng);
      if (st.spaces[0]!.burning) litAt = i;
    }
    expect(litAt).toBeLessThan(Infinity);
  });
});

describe('stepPhysics purity', () => {
  it('does not mutate its input state', () => {
    const st = stateOf(DEMO);
    const before = JSON.stringify(st);
    const next = stepPhysics(st, DEMO, makeRng(1));
    expect(JSON.stringify(st)).toBe(before);
    expect(next.spaces).not.toBe(st.spaces);
    expect(next.spaces[0]).not.toBe(st.spaces[0]);
  });
});
