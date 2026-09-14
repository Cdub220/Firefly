import { describe, expect, it } from 'vitest';
import { DEMO_TRACE_VERSION, parseDemoTrace } from './demoTrace';
import { buildDemoTrace, DEFAULT_RECORDED_BEATS } from './demoTraceBuild';
import { BEATS, SCRIPT_PLANS } from './store';

describe('buildDemoTrace', () => {
  // Short on purpose: six beats, one of them two closed-loop runs, on the two large plans.
  const trace = buildDemoTrace({ seed: 42, ticks: 6, now: () => '2026-09-13T00:00:00.000Z' });

  it('records every script beat in order with the config each one ran', () => {
    expect(trace.version).toBe(DEMO_TRACE_VERSION);
    expect(trace.exportedAt).toBe('2026-09-13T00:00:00.000Z');
    expect(trace.beats.map((b) => b.beat)).toEqual(DEFAULT_RECORDED_BEATS);
    expect(DEFAULT_RECORDED_BEATS).toEqual(BEATS.map((b) => b.key).filter((k) => k !== 'casefile'));
    const by = Object.fromEntries(trace.beats.map((b) => [b.beat, b]));
    expect(by['clean']!.planName).toBe(SCRIPT_PLANS.first);
    expect(by['clean']!.corruption).toEqual({ mode: 'none' });
    expect(by['freeze']!.corruption.mode).toBe('freeze');
    expect(by['freeze']!.corruption.target).toEqual([by['freeze']!.ignition]);
    expect(by['flashover']!.corruption.mode).toBe('flashover');
    expect(by['compare']!.corruption).toEqual(by['flashover']!.corruption); // same config
    expect(by['building']!.planName).toBe(SCRIPT_PLANS.last);
    expect(by['building']!.corruption.mode).toBe('flashover');
    for (const b of trace.beats) {
      expect(b.ticks).toBe(6);
      expect(b.seed).toBe(42);
      expect(Object.keys(b.traces).sort()).toEqual(['kalman', 'ours']);
      expect(b.traces['ours']).toHaveLength(6);
    }
  });

  it('only the compare beat is closed loop and carries head-to-head traces', () => {
    for (const b of trace.beats) {
      const cmds = Object.values(b.traces).flat().reduce((n, r) => n + r.commands.length, 0);
      if (b.beat === 'compare') {
        expect(b.closedLoop).toBe(true);
        expect(cmds).toBeGreaterThan(0);
        expect(Object.keys(b.compare!).sort()).toEqual(['kalman', 'ours']);
      } else {
        expect(b.closedLoop).toBe(false);
        expect(cmds).toBe(0);
        expect(b.compare).toBeUndefined();
      }
    }
  });

  it('survives a JSON round trip through the parser unchanged (bar stepMs)', () => {
    const json = JSON.parse(JSON.stringify(trace)) as unknown;
    const parsed = parseDemoTrace(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.trace.beats.map((b) => b.beat)).toEqual(trace.beats.map((b) => b.beat));
    expect(parsed.trace.beats[0]!.traces['ours']![3]!.truth).toEqual(trace.beats[0]!.traces['ours']![3]!.truth);
  });
});

describe('parseDemoTrace rejects what it cannot replay, without throwing', () => {
  const good = JSON.parse(JSON.stringify(buildDemoTrace({ ticks: 3, beats: ['clean'] }))) as Record<string, unknown>;
  const beat = () => (JSON.parse(JSON.stringify(good)) as { beats: Array<Record<string, unknown>> }).beats[0]!;
  const why = (json: unknown): string => { const p = parseDemoTrace(json); return p.ok ? 'OK' : p.why; };

  it('shape errors', () => {
    expect(why(null)).toMatch(/not a JSON object/);
    expect(why('x')).toMatch(/not a JSON object/);
    expect(why([])).toMatch(/not a JSON object/);
    expect(why({})).toMatch(/version/);
    expect(why({ version: 99, beats: [] })).toMatch(/version 99/);
    expect(why({ version: DEMO_TRACE_VERSION, beats: [] })).toMatch(/no beats/);
    expect(why({ version: DEMO_TRACE_VERSION, beats: [1] })).toMatch(/beat 0: not an object/);
    expect(why({ version: DEMO_TRACE_VERSION, beats: [{}] })).toMatch(/missing beat key/);
  });

  it('per-beat errors name the beat', () => {
    const b = beat();
    expect(why({ version: 1, beats: [{ ...b, planName: 3 }] })).toMatch(/clean.*planName/);
    // A recording from a build with other plan files, or a space this plan lacks, is refused up front (never a throw mid-click).
    expect(why({ version: 1, beats: [{ ...b, planName: 'nope' }] })).toMatch(/plan "nope" is not in this build/);
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) expect(why({ version: 1, beats: [{ ...b, planName: name }] })).toMatch(/is not in this build/);
    expect(why({ version: 1, beats: [{ ...b, ignition: 'ZZZ' }] })).toMatch(/ignition "ZZZ" is not a space of/);
    expect(why({ version: 1, beats: [{ ...b, ticks: 'x' }] })).toMatch(/clean.*seed and ticks/);
    expect(why({ version: 1, beats: [{ ...b, corruption: {} }] })).toMatch(/clean.*corruption.mode/);
    expect(why({ version: 1, beats: [{ ...b, traces: {} }] })).toMatch(/no brains/);
    expect(why({ version: 1, beats: [{ ...b, traces: { ours: [] } }] })).toMatch(/empty/);
    expect(why({ version: 1, beats: [{ ...b, traces: { ours: [{ t: 1 }] } }] })).toMatch(/not a tick/);
    expect(why({ version: 1, beats: [{ ...b, ticks: 2 }] })).toMatch(/trace length is not ticks/);
    expect(why({ version: 1, beats: [b, b] })).toMatch(/appears twice/);
    const t = b['traces'] as Record<string, unknown[]>;
    expect(why({ version: 1, beats: [{ ...b, traces: { ours: t['ours'], kalman: t['kalman']!.slice(0, 2) } }] })).toMatch(/different trace lengths/);
    expect(why({ version: 1, beats: [{ ...b, compare: { ours: [] } }] })).toMatch(/compare.*empty/);
  });

  it('accepts the good file, reads closedLoop strictly, and tolerates a missing caption', () => {
    expect(why(good)).toBe('OK');
    const p = parseDemoTrace({ ...good, beats: [{ ...beat(), closedLoop: 'yes', caption: undefined }] });
    expect(p.ok && p.trace.beats[0]!.closedLoop).toBe(false);
    expect(p.ok && p.trace.beats[0]!.caption).toBe('');
  });

  it('records each beat caption and no timestamp unless asked, so the export is byte-stable', () => {
    const t = buildDemoTrace({ ticks: 2, beats: ['clean', 'building'] });
    expect(t.exportedAt).toBe('');
    expect(t.beats[0]!.caption).toMatch(/Every sensor is honest/);
    expect(t.beats[1]!.caption).toMatch(/Different structure/);
    // Same inputs, same bytes (stepMs aside, which the exporter zeroes).
    const strip = (x: unknown) => JSON.stringify(x, (k, v: unknown) => (k === 'stepMs' ? 0 : v));
    expect(strip(buildDemoTrace({ ticks: 2, beats: ['clean'] }))).toBe(strip(buildDemoTrace({ ticks: 2, beats: ['clean'] })));
  });
});
