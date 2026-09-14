/**
 * Pure per-floor readings off a trace, in minutes. Shared by the CLI (run.ts) and the
 * Case file view; no fs, no brain.
 */
import type { TickRecord } from '../loop';
import type { KnowledgeStage } from './commander';
import { floorOf } from './calibration';

/** Minute the belief first named any space of each floor as burning. */
export function firstNamedByFloor(trace: readonly Pick<TickRecord, 't' | 'belief'>[], tickMinutes: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of trace) for (const id of r.belief.burningSet) { const f = floorOf(id); if (!Number.isNaN(f)) out[f] ??= r.t * tickMinutes; }
  return out;
}

/** Minute each floor first had a burning space in truth. */
export function firstBurningByFloor(trace: readonly Pick<TickRecord, 't' | 'truth'>[], tickMinutes: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of trace) for (const s of r.truth.spaces) if (s.burning) out[s.level] ??= r.t * tickMinutes;
  return out;
}

/** Minute the belief first named a space on `floor` with confidence >= 0.9, or null. */
export function certainAt(trace: readonly Pick<TickRecord, 't' | 'belief'>[], tickMinutes: number, floor: number): number | null {
  for (const r of trace) if (r.belief.confidence >= 0.9 && r.belief.burningSet.some((id) => floorOf(id) === floor)) return r.t * tickMinutes;
  return null;
}

/** The record's "the commander was told floor f is burning" minute, from the knowledge schedule. */
export function knownAtFromStages(stages: readonly KnowledgeStage[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const s of [...stages].sort((a, b) => a.minute - b.minute)) for (const f of s.floors) out[f] ??= s.minute;
  return out;
}

/** Floors burning in truth at each tick (for a stepped chart), as sorted arrays. */
export function floorsBurningByTick(trace: readonly Pick<TickRecord, 'truth'>[]): number[][] {
  return trace.map((r) => [...new Set(r.truth.spaces.filter((s) => s.burning).map((s) => s.level))].sort((a, b) => a - b));
}
