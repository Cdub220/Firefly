/**
 * Seeded deterministic RNG (mulberry32). Every random draw in this repo goes through
 * makeRng(seed). Math.random is banned by lint.
 */
export type Rng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Approximately N(0,1) via Box-Muller. */
  gauss(): number;
  /** Uniformly chosen element. Throws on empty array. */
  pick<T>(xs: readonly T[]): T;
  /** Fisher-Yates shuffle, returns a new array. */
  shuffle<T>(xs: readonly T[]): T[];
  /** Fork a child stream so subsystems don't perturb each other's draws. */
  fork(label: string): Rng;
};

function hashLabel(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function makeRng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    range: (lo, hi) => lo + next() * (hi - lo),
    gauss: () => {
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (xs) => {
      if (xs.length === 0) throw new Error('rng.pick on empty array');
      return xs[Math.floor(next() * xs.length)] as (typeof xs)[number];
    },
    shuffle: (xs) => {
      const out = xs.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i] as (typeof out)[number];
        out[i] = out[j] as (typeof out)[number];
        out[j] = tmp;
      }
      return out;
    },
    fork: (label) => makeRng((seed ^ hashLabel(label)) >>> 0),
  };
  return rng;
}
