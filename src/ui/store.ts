/**
 * src/ui — owned by Chase. Zustand store for UI state.
 */
import { create } from 'zustand';
import { DEMO_PLAN, runLoop, type TickRecord } from '../loop';

type SimState = {
  seed: number;
  ticks: number;
  trace: TickRecord[];
  cursor: number;
  run: () => void;
  setCursor: (i: number) => void;
  setSeed: (seed: number) => void;
};

export const useSim = create<SimState>((set, get) => ({
  seed: 42,
  ticks: 50,
  trace: [],
  cursor: 0,
  run: () => {
    const { seed, ticks } = get();
    const trace = runLoop({ plan: DEMO_PLAN, seed, ticks });
    set({ trace, cursor: trace.length - 1 });
  },
  setCursor: (cursor) => set({ cursor }),
  setSeed: (seed) => set({ seed }),
}));
