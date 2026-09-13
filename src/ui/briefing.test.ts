import { describe, expect, it } from 'vitest';
import { DEMO_PLAN, runLoop } from '../loop';
import type { TickRecord } from '../loop';
import { computeOutcome } from '../eval/outcome';
import { beliefBriefing, briefingAt, briefingEvents } from './briefing';

describe('briefing', () => {
  const trace = runLoop({ plan: DEMO_PLAN, seed: 42, ticks: 30, corruption: { mode: 'freeze', k: 1, onset: 5, target: ['S3'] } });
  const events = briefingEvents(trace, DEMO_PLAN);

  it("the brain's own briefing string wins when present, and only a non-empty string counts", () => {
    const rec = trace[10]!;
    const withOwn = { ...rec, belief: { ...rec.belief, briefing: '  hold S3, scout S2  ' } } as TickRecord;
    expect(beliefBriefing(withOwn)).toBe('hold S3, scout S2');
    expect(briefingAt(withOwn, events)).toBe('hold S3, scout S2');
    expect(beliefBriefing({ ...rec, belief: { ...rec.belief, briefing: 42 } } as TickRecord)).toBe('');
    expect(beliefBriefing({ ...rec, belief: { ...rec.belief, briefing: '   ' } } as TickRecord)).toBe('');
    expect(beliefBriefing(rec)).toBe('');
    expect(beliefBriefing(undefined)).toBe('');
  });

  it('otherwise shows the latest brain-side event at or before the cursor tick, and nothing before the first', () => {
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e, i) => i === 0 || e.t >= events[i - 1]!.t)).toBe(true);
    // Only what a brain could know: no ignition / burn-out / containment lines from truth.
    expect(events.every((e) => e.kind === 'sensor-suspect' || e.kind === 'dispatch' || e.kind === 'hedge')).toBe(true);
    expect(events.some((e) => e.kind === 'sensor-suspect')).toBe(true); // the frozen sensor gets flagged
    expect(computeOutcome([...trace], DEMO_PLAN).events.some((e) => e.kind === 'ignition')).toBe(true); // the model has more; we drop it
    const first = events[0]!;
    expect(briefingAt(trace[first.t - 1]!, events)).toBe(`t=${first.t} · ${first.text}`);
    const last = trace[trace.length - 1]!;
    const latest = [...events].reverse().find((e) => e.t <= last.t)!;
    expect(briefingAt(last, events)).toBe(`t=${latest.t} · ${latest.text}`);
    // An event after the cursor is not shown yet.
    const future = events.filter((e) => e.t > 5);
    expect(briefingAt(trace[0]!, future)).toBe('');
    expect(briefingAt(undefined, events)).toBe('');
    expect(briefingAt(trace[0]!, [])).toBe('');
    expect(briefingEvents([], DEMO_PLAN)).toEqual([]);
  });
});
