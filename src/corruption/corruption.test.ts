/**
 * Failure-model tests. Observations are built by hand — importing the world here would
 * defeat the point (and the arch rules).
 */
import { describe, expect, it } from 'vitest';
import { createCorruptor, DEFAULT_CORRUPTION } from './index';
import type { Drone, Observation, Reading } from '../shared/types';

const reading = (
  sensorId: string,
  spaceId: string,
  temp: number,
  t: number,
  droneId?: string,
): Reading => ({
  sensorId,
  source: droneId === undefined ? 'fixed' : 'drone',
  ...(droneId === undefined ? {} : { droneId }),
  spaceId,
  temp,
  t,
});

const drone = (id: string, at: string, over: Partial<Drone> = {}): Drone => ({
  id,
  class: 'scout',
  at,
  resource: 1,
  alive: true,
  linked: true,
  ...over,
});

const obs = (t: number, readings: Reading[], drones: Drone[] = []): Observation => ({
  t,
  readings,
  drones,
});

/** Clean stream: three fixed sensors whose temps change every tick. */
const cleanTick = (t: number): Observation =>
  obs(t, [
    reading('F1', 'S1', 20 + t * 10, t),
    reading('F2', 'S2', 30 + t * 10, t),
    reading('F3', 'S3', 40 + t * 10, t),
  ]);

describe('none', () => {
  it('returns a deep-equal observation', () => {
    const c = createCorruptor({ seed: 42, mode: 'none' });
    const input = cleanTick(3);
    expect(c.apply(input)).toEqual(input);
  });
});

describe('freeze', () => {
  it('k=1 onset=2: exactly one sensor stops changing after tick 2, t frozen, others untouched', () => {
    const c = createCorruptor({ seed: 42, mode: 'freeze', k: 1, onset: 2 });
    const outs = [1, 2, 3, 4, 5].map((t) => c.apply(cleanTick(t)));

    const byId = (o: Observation, id: string): Reading => {
      const r = o.readings.find((x) => x.sensorId === id);
      if (!r) throw new Error(`missing ${id}`);
      return r;
    };
    const ids = ['F1', 'F2', 'F3'];
    const frozenIds = ids.filter((id) =>
      outs.slice(1).every((o) => byId(o, id).temp === byId(outs[1]!, id).temp && byId(o, id).t === 2),
    );
    expect(frozenIds).toHaveLength(1);
    const frozenId = frozenIds[0]!;

    // Before onset nothing is touched, and untouched sensors match clean exactly.
    expect(outs[0]).toEqual(cleanTick(1));
    for (const [i, t] of [1, 2, 3, 4, 5].entries()) {
      const clean = cleanTick(t);
      for (const id of ids) {
        if (id === frozenId && t > 2) continue;
        expect(byId(outs[i]!, id)).toEqual(byId(clean, id));
      }
    }
  });

  it('a frozen drone temp sensor freezes the self-report too (same at, same resource)', () => {
    // target S9 so the only candidate is the drone-borne sensor; k covers it.
    const c = createCorruptor({ seed: 7, mode: 'freeze', k: 3, onset: 1, target: ['S9'] });
    const tick = (t: number, at: string, resource: number): Observation =>
      obs(
        t,
        [reading('F1', 'S1', 25, t), reading('D1:temp', at, 100 + t, t, 'D1')],
        [drone('D1', at, { resource })],
      );
    c.apply(tick(1, 'S9', 0.9));
    const out = c.apply(tick(2, 'S4', 0.5)); // the drone moved and spent resource
    const d = out.drones.find((x) => x.id === 'D1');
    expect(d).toMatchObject({ at: 'S9', resource: 0.9 });
    const r = out.readings.find((x) => x.sensorId === 'D1:temp');
    expect(r).toMatchObject({ temp: 101, t: 1, spaceId: 'S9' });
  });
});

describe('blind', () => {
  it('target S3: that sensor reports ambient-ish even at clean 450; others untouched', () => {
    const c = createCorruptor({ seed: 42, mode: 'blind', onset: 1, target: ['S3'], ambient: 22 });
    for (const t of [1, 2, 3]) {
      const input = obs(t, [reading('F1', 'S1', 30, t), reading('F3', 'S3', 450, t)]);
      const out = c.apply(input);
      const blinded = out.readings.find((r) => r.sensorId === 'F3');
      expect(blinded).toBeDefined();
      expect(Math.abs(blinded!.temp - 22)).toBeLessThan(5);
      expect(blinded!.t).toBe(t); // looks current — that is the danger
      expect(out.readings.find((r) => r.sensorId === 'F1')).toEqual(input.readings[0]);
    }
  });
});

describe('saturate', () => {
  it('a reading of 800 becomes exactly saturateAt; 100 is untouched', () => {
    const c = createCorruptor({ seed: 42, mode: 'saturate' });
    const input = obs(1, [reading('F1', 'S1', 800, 1), reading('F2', 'S2', 100, 1)]);
    const out = c.apply(input);
    expect(out.readings[0]!.temp).toBe(DEFAULT_CORRUPTION.saturateAt);
    expect(out.readings[1]).toEqual(input.readings[1]);
  });
});

describe('flashover', () => {
  it('a space at 600 loses all readings permanently and its drone reports dead', () => {
    const c = createCorruptor({ seed: 42, mode: 'flashover' });
    const hot = obs(
      1,
      [reading('F3', 'S3', 600, 1), reading('D1:temp', 'S3', 590, 1, 'D1'), reading('F1', 'S1', 30, 1)],
      [drone('D1', 'S3'), drone('D2', 'S1')],
    );
    const out = c.apply(hot);
    expect(out.readings.filter((r) => r.spaceId === 'S3')).toHaveLength(0);
    expect(out.readings.find((r) => r.sensorId === 'F1')).toBeDefined();
    expect(out.drones.find((d) => d.id === 'D1')).toMatchObject({ alive: false, linked: false });
    expect(out.drones.find((d) => d.id === 'D2')).toMatchObject({ alive: true, linked: true });

    // Permanence: even after the space cools, its sensors are gone and the drone stays dead.
    const cooled = obs(2, [reading('F3', 'S3', 90, 2), reading('F1', 'S1', 30, 2)], [drone('D1', 'S3')]);
    const later = c.apply(cooled);
    expect(later.readings.filter((r) => r.spaceId === 'S3')).toHaveLength(0);
    expect(later.drones.find((d) => d.id === 'D1')).toMatchObject({ alive: false, linked: false });
  });
});

describe('determinism and purity', () => {
  const stream = (t: number): Observation =>
    obs(
      t,
      [
        reading('F1', 'S1', 20 + t * 30, t),
        reading('F2', 'S2', 520, t),
        reading('F3', 'S3', 350, t),
        reading('D1:temp', 'S4', 25 + t, t, 'D1'),
      ],
      [drone('D1', 'S4'), drone('D2', 'S1')],
    );

  it('same seed, same input sequence, same output sequence (mixed mode)', () => {
    const run = (): string => {
      const c = createCorruptor({ seed: 42, mode: 'mixed', k: 2, onset: 2 });
      return JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8].map((t) => c.apply(stream(t))));
    };
    expect(run()).toBe(run());
  });

  it('reset(seed) restores the exact sequence', () => {
    const c = createCorruptor({ seed: 42, mode: 'mixed', k: 2, onset: 2 });
    const first = JSON.stringify([1, 2, 3].map((t) => c.apply(stream(t))));
    c.reset(42);
    expect(JSON.stringify([1, 2, 3].map((t) => c.apply(stream(t))))).toBe(first);
  });

  it('mixed mode never reports above saturateAt, even from a sensor frozen while hot', () => {
    // Whatever fate seed hands the S1 sensor (freeze or blind), a sensor whose clean temp
    // is 450 was physically pinned at saturateAt when it froze; the held value must not
    // leak the clean temperature. (450 stays below flashoverTemp so the space survives.)
    for (let seed = 1; seed <= 30; seed++) {
      const c = createCorruptor({ seed, mode: 'mixed', k: 1, onset: 1, target: ['S1'], ambient: 22 });
      c.apply(obs(1, [reading('F1', 'S1', 450, 1)]));
      const out = c.apply(obs(2, [reading('F1', 'S1', 480, 2)]));
      const r = out.readings.find((x) => x.sensorId === 'F1');
      expect(r).toBeDefined();
      expect(r!.temp).toBeLessThanOrEqual(DEFAULT_CORRUPTION.saturateAt);
    }
  });

  it('never mutates the input observation', () => {
    const c = createCorruptor({ seed: 42, mode: 'mixed', k: 2, onset: 1 });
    const input = stream(1);
    const snapshot = JSON.parse(JSON.stringify(input)) as Observation;
    c.apply(input);
    expect(input).toEqual(snapshot);
  });
});
