/**
 * The sweep harness on a --quick grid: row count, finiteness, aggregation, the
 * WHERE OURS LOSES block, target resolution, and the CLI flag parser.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_PLAN } from '../loop';
import { aggregate, farthestSpace, formatLosses, formatSummary, hottestNeighborAt, parseSweepArgs, QUICK, resolveTarget, runSweep, TARGET_KINDS, whereOursLoses, writeResults } from './sweep';

describe('sweep', () => {
  const result = runSweep({ plans: ['demo-6'], modes: ['freeze'], ks: [1, 2, 3], targets: [...TARGET_KINDS], onset: 5, ...QUICK });

  it('--quick on demo-6 with one mode: expected row count and every metric finite', () => {
    // 1 plan x 1 mode x 3 k x 4 targets x 2 seeds x 4 brains (ours, naive, gated, source kalman)
    expect(result.rows.length).toBe(1 * 1 * 3 * 4 * 2 * 4);
    for (const r of result.rows) {
      for (const key of ['estimationError', 'falseCertainty', 'ambiguityCoverage', 'computeMsPerTick', 'wrongDispatch', 'brierScore', 'falsePositiveRate', 'falseNegativeRate'] as const) {
        expect(Number.isFinite(r[key])).toBe(true);
      }
      expect(r.timeToRecovery === null || Number.isFinite(r.timeToRecovery)).toBe(true);
      expect(r.computeMsPerTick).toBeGreaterThan(0);
      expect(['ours', 'kalman', 'kalman-gated', 'kalman-source']).toContain(r.brain);
      expect(r.targetSpaces === null ? r.target === 'random' : r.target !== 'random').toBe(true);
    }
    expect(result.meta.ticks).toBe(60);
    expect(result.meta.seeds).toEqual([1, 2]);
  });

  it('every cell is scored for all four brains on the same seeds, and ours is never false-certain here', () => {
    const cells = new Set(result.rows.map((r) => [r.plan, r.mode, r.k, r.target, r.seed].join('|')));
    expect(cells.size).toBe(24);
    for (const cell of cells) {
      const both = result.rows.filter((r) => [r.plan, r.mode, r.k, r.target, r.seed].join('|') === cell).map((r) => r.brain).sort();
      expect(both).toEqual(['kalman', 'kalman-gated', 'kalman-source', 'ours']);
    }
    for (const r of result.rows.filter((r) => r.brain === 'ours')) expect(r.falseCertainty).toBe(0);
  });

  it('aggregate averages over seeds and keeps ours/kalman/gated/source on adjacent rows in the summary', () => {
    const aggs = aggregate(result.rows);
    expect(aggs.length).toBe(3 * 4 * 4);
    for (const a of aggs) expect(a.seeds).toBe(2);
    const text = formatSummary(aggs);
    const lines = text.split('\n').filter((l) => l.startsWith('demo-6'));
    expect(lines.length).toBe(48);
    for (let i = 0; i < lines.length; i += 4) {
      expect(lines[i]).toContain(' ours ');
      expect(lines[i + 1]).toContain(' kalman ');
      expect(lines[i + 2]).toContain(' kalman-gated ');
      expect(lines[i + 3]).toContain(' kalman-source ');
    }
    const losses = whereOursLoses(aggs);
    expect(Array.isArray(losses)).toBe(true);
    expect(formatLosses(losses)).toContain('WHERE OURS LOSES');
    // A synthetic loss is reported, never hidden.
    const worse = aggs.map((a) => (a.brain === 'ours' ? { ...a, wrongDispatch: 0.9 } : a));
    expect(whereOursLoses(worse).length).toBe(12);
    expect(formatLosses(whereOursLoses(worse))).toContain('wrongDispatch 90%');
  });

  it('writes sweep-<timestamp>.json and sweep-latest.json with identical content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'firefly-sweep-'));
    const paths = writeResults(result, dir);
    expect(existsSync(paths.stamped)).toBe(true);
    expect(existsSync(paths.latest)).toBe(true);
    expect(readFileSync(paths.stamped, 'utf8')).toBe(readFileSync(paths.latest, 'utf8'));
    const parsed = JSON.parse(readFileSync(paths.latest, 'utf8')) as typeof result;
    expect(parsed.rows.length).toBe(result.rows.length);
  });

  it('resolves targets: ignition, hottest neighbor at onset, farthest by edge hops, random = corruptor picks', () => {
    expect(resolveTarget(DEMO_PLAN, 'ignition', 5, 1)).toEqual(['S3']);
    expect(resolveTarget(DEMO_PLAN, 'neighbor', 5, 1)).toEqual(['S2']); // door 0.15 beats bulkhead 0.05
    expect(hottestNeighborAt(DEMO_PLAN, 'S3', 5, 1)).toBe('S2');
    // From S3 on the ring: S2/S4 at 1 hop, S1/S5 at 2, S6 at 3.
    expect(farthestSpace(DEMO_PLAN, 'S3')).toBe('S6');
    expect(resolveTarget(DEMO_PLAN, 'far', 5, 1)).toEqual(['S6']);
    expect(resolveTarget(DEMO_PLAN, 'random', 5, 1)).toBeNull();
    expect(farthestSpace({ ...DEMO_PLAN, edges: [] }, 'S3')).toBe('S3'); // nothing reachable
  });

  it('parses CLI flags and rejects typos loudly', () => {
    const o = parseSweepArgs(['--quick', '--plans', 'demo-6', '--modes', 'freeze,blind', '--k', '1,2', '--targets', 'ignition,far', '--seeds', '3..5', '--ticks', '80', '--onset', '7']);
    expect(o).toMatchObject({ plans: ['demo-6'], modes: ['freeze', 'blind'], ks: [1, 2], targets: ['ignition', 'far'], seeds: [3, 4, 5], ticks: 80, onset: 7 });
    expect(parseSweepArgs(['--quick']).seeds).toEqual([1, 2]);
    expect(parseSweepArgs(['--quick']).ticks).toBe(60);
    expect(parseSweepArgs([]).seeds.length).toBe(10);
    expect(parseSweepArgs([]).ticks).toBe(120);
    expect(() => parseSweepArgs(['--plans', 'nope'])).toThrow(/unknown plan/);
    expect(() => parseSweepArgs(['--modes', 'none'])).toThrow(/--modes/);
    expect(() => parseSweepArgs(['--targets', 'middle'])).toThrow(/--targets/);
    expect(() => parseSweepArgs(['--k', 'x'])).toThrow(/--k/);
    expect(() => parseSweepArgs(['--k', '0'])).toThrow(/--k/);
    expect(() => parseSweepArgs(['--k', '1.5'])).toThrow(/--k/);
    expect(() => parseSweepArgs(['--ticks', '0'])).toThrow(/--ticks/);
    expect(() => parseSweepArgs(['--onset', 'x'])).toThrow(/--onset/);
    expect(() => parseSweepArgs(['--onset', '-1'])).toThrow(/--onset/);
    expect(() => parseSweepArgs(['--seeds', 'a,b'])).toThrow(/--seeds/);
    expect(() => parseSweepArgs(['--plans', ''])).toThrow(/--plans/);
    expect(() => parseSweepArgs(['--modes', ''])).toThrow(/--modes/);
    expect(() => parseSweepArgs(['--targets', ''])).toThrow(/--targets/);
    expect(parseSweepArgs(['--onset', '0']).onset).toBe(0);
  });
});
