/**
 * runContainment: the same seed twice, with and without the allocator; withoutCommands strips.
 */
import { describe, expect, it } from 'vitest';
import { createBrain } from '../brain';
import { DEMO_PLAN, runLoop } from '../loop';
import { burningCount, runContainment, withoutCommands } from './containment';

describe('containment', () => {
  it('withoutCommands keeps the belief and strips every command', () => {
    const inner = createBrain({ plan: DEMO_PLAN, seed: 1 });
    const stripped = withoutCommands(createBrain)({ plan: DEMO_PLAN, seed: 1 });
    const trace = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 8 });
    for (const rec of trace) {
      const a = inner.step(rec.obs);
      const b = stripped.step(rec.obs);
      expect(b.commands).toEqual([]);
      expect(b.belief).toEqual(a.belief);
    }
    expect(trace.some((r) => r.belief.burningSet.length > 0)).toBe(true);
  });

  it('runContainment: both runs closed-loop on one seed; the null run has no commands and burns at least as much', () => {
    const run = runContainment({ plan: DEMO_PLAN, seed: 1, ticks: 40 });
    expect(run.nullAllocator.every((r) => r.commands.length === 0)).toBe(true);
    expect(run.withAllocator.some((r) => r.commands.some((c) => c.task !== 'hold'))).toBe(true);
    // Same world until the first command is applied: tick 1 truth identical.
    expect(run.withAllocator[0]!.truth.spaces.map((s) => s.temp)).toEqual(run.nullAllocator[0]!.truth.spaces.map((s) => s.temp));
    expect(run.containmentDelta).toBe(burningCount(run.withAllocator[39]!) - burningCount(run.nullAllocator[39]!));
    expect(run.containmentDelta).toBeLessThanOrEqual(0);
    // The null run equals a plain open-loop run.
    const open = runLoop({ plan: DEMO_PLAN, seed: 1, ticks: 40 });
    expect(run.nullAllocator.map((r) => r.truth)).toEqual(open.map((r) => r.truth));
  });
});
