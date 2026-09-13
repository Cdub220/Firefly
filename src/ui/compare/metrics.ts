/**
 * Pure helpers for the head-to-head view: the containment series, the "better" comparator
 * for the scorecard, and the wrong-dispatch rule. No React, no three.
 */
import type { TickRecord } from '../../loop';
import type { Metrics } from '../../eval/metrics';
import type { Belief, SpaceId } from '../../shared/types';

/** Spaces burning in truth at each tick. */
export function containmentSeries(trace: readonly Pick<TickRecord, 'truth'>[]): number[] {
  return trace.map((r) => r.truth.spaces.filter((s) => s.burning).length);
}

/** The corruption onset a trace ran with, or 0 for a clean run. */
export function onsetOf(trace: readonly Pick<TickRecord, 'onset'>[]): number {
  return trace[0]?.onset ?? 0;
}

export type ScoreKey = 'falseCertainty' | 'wrongDispatch' | 'ambiguityCoverage' | 'timeToRecovery';
export const SCORE_KEYS: readonly ScoreKey[] = ['falseCertainty', 'wrongDispatch', 'ambiguityCoverage', 'timeToRecovery'];
export const SCORE_LABEL: Record<ScoreKey, string> = {
  falseCertainty: 'false certainty',
  wrongDispatch: 'wrong dispatch',
  ambiguityCoverage: 'coverage',
  timeToRecovery: 'recovery (ticks)',
};
/** Which direction wins. Coverage: higher. Everything else: lower, and never recovering is worst. */
const HIGHER_IS_BETTER: Record<ScoreKey, boolean> = { falseCertainty: false, wrongDispatch: false, ambiguityCoverage: true, timeToRecovery: false };

export type Better = 'a' | 'b' | 'tie';

/** Compare one metric between two brains. null (never recovered) loses to any number; two nulls tie. */
export function better(key: ScoreKey, a: number | null, b: number | null): Better {
  if (a === null && b === null) return 'tie';
  if (a === null) return 'b';
  if (b === null) return 'a';
  if (!Number.isFinite(a) && !Number.isFinite(b)) return 'tie';
  if (!Number.isFinite(a)) return 'b';
  if (!Number.isFinite(b)) return 'a';
  if (Math.abs(a - b) < 1e-9) return 'tie';
  const aWins = HIGHER_IS_BETTER[key] ? a > b : a < b;
  return aWins ? 'a' : 'b';
}

export function scoreOf(m: Metrics, key: ScoreKey): number | null {
  return m[key];
}

export function formatScore(key: ScoreKey, v: number | null): string {
  if (v === null) return 'never';
  if (key === 'timeToRecovery') return String(Math.round(v));
  return `${Math.round(v * 100)}%`;
}

/**
 * Spaces a brain names as burning that are not burning in truth. With `excludeAmbiguous`
 * a space inside any ambiguous group is not counted: the brain said it was unsure.
 */
export function wrongDispatchSpaces(rec: Pick<TickRecord, 'truth'>, belief: Pick<Belief, 'burningSet' | 'ambiguous'>, excludeAmbiguous: boolean): SpaceId[] {
  const burning = new Set(rec.truth.spaces.filter((s) => s.burning).map((s) => s.id));
  const hedged = new Set(excludeAmbiguous ? belief.ambiguous.flat() : []);
  return belief.burningSet.filter((id) => !burning.has(id) && !hedged.has(id));
}
