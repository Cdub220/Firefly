import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop } from '../../loop';
import { isDoorOpen, LYING_THRESHOLD_C, truthFrame } from './frame';

describe('truthFrame', () => {
  it('carries temps, burning, doors and marks every present fixed sensor ok on a clean run', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 5 });
    const f = truthFrame(trace[4]!, DEMO_PLAN);
    expect(Object.keys(f.temps).sort()).toEqual(DEMO_PLAN.spaces.map((s) => s.id).sort());
    expect(f.burning['S3']).toBe(true);
    expect(isDoorOpen(f, 'S1', 'S2')).toBe(true);
    for (const s of DEMO_PLAN.sensors) expect(f.sensors[s.id]).toBe('ok');
  });

  it('marks a frozen sensor lying once its stale value drifts, and a missing sensor dead', () => {
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 40, corruption: { mode: 'freeze', k: 1, onset: 3, target: ['S3'] } });
    const late = truthFrame(trace[39]!, DEMO_PLAN);
    const s3 = DEMO_PLAN.sensors.find((s) => s.spaceId === 'S3')!;
    const reading = trace[39]!.obs.readings.find((r) => r.sensorId === s3.id)!;
    const truth = trace[39]!.truth.spaces.find((s) => s.id === 'S3')!;
    expect(Math.abs(reading.temp - truth.temp)).toBeGreaterThan(LYING_THRESHOLD_C);
    expect(late.sensors[s3.id]).toBe('lying');

    const rec = trace[39]!;
    const dropped = { ...rec, obs: { ...rec.obs, readings: rec.obs.readings.filter((r) => r.sensorId !== s3.id) } };
    expect(truthFrame(dropped, DEMO_PLAN).sensors[s3.id]).toBe('dead');
  });
});
