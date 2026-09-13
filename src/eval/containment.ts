/**
 * src/eval — owned by Dean.
 *
 * Closed-loop helpers for the allocator's numbers (CP4 prompt 2). The estimator is
 * evaluated open-loop; the allocator is evaluated by running the same seed twice, once
 * with the brain's commands applied and once with a null allocator, and comparing what
 * burned.
 */
import { createBrain } from '../brain';
import { runLoop, type BrainFactory, type LoopConfig, type TickRecord } from '../loop';

/** Wrap a brain factory so the brain's commands are stripped: the null allocator. */
export const withoutCommands =
  (factory: BrainFactory): BrainFactory =>
  (cfg) => {
    // The wrapped brain must not assume its stripped commands were obeyed (a tether it told
    // to suppress is not suppressing), so it runs as an open-loop brain.
    const inner = factory({ ...cfg, dispatch: false });
    return {
      step: (obs) => ({ belief: inner.step(obs).belief, commands: [] }),
      reset: () => inner.reset(),
    };
  };

export const burningCount = (rec: TickRecord): number => rec.truth.spaces.filter((s) => s.burning).length;

export type ContainmentRun = {
  /** Trace with the allocator driving the world. */
  withAllocator: TickRecord[];
  /** Same seed, same corruption, no commands applied. */
  nullAllocator: TickRecord[];
  /** Spaces burning at the last tick: with the allocator minus without. Negative is good. */
  containmentDelta: number;
};

/**
 * Run the loop twice on identical seeds: once closed-loop with `brain` (default ours) and
 * once with the same brain's commands stripped. Both runs use dispatch: true, so the only
 * difference is the allocator.
 */
export function runContainment(cfg: Omit<LoopConfig, 'dispatch'>): ContainmentRun {
  const brain = cfg.brain ?? createBrain;
  const withAllocator = runLoop({ ...cfg, brain, dispatch: true });
  const nullAllocator = runLoop({ ...cfg, brain: withoutCommands(brain), dispatch: true });
  const last = (t: TickRecord[]): number => (t.length ? burningCount(t[t.length - 1]!) : 0);
  return { withAllocator, nullAllocator, containmentDelta: last(withAllocator) - last(nullAllocator) };
}
