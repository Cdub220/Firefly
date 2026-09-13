/**
 * The commander's brief: sections, the play-by-play cap, determinism; and the CLI end to end.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_PLAN, runLoop } from '../loop';
import { closing, MAX_PLAY_BY_PLAY, renderBrief } from './brief';
import { BRIEF_BRAINS, cell, formatTable, parseBriefArgs, runBriefs, TABLE_COLUMNS, writeBrief } from './brief-cli';
import { computeOutcome, type Outcome } from './outcome';

describe('renderBrief', () => {
  const trace = runLoop({ plan: DEMO_PLAN, seed: 7, ticks: 40, dispatch: true, corruption: { mode: 'freeze', k: 1, onset: 5, target: ['S3'], ambient: 20 } });
  const outcome = computeOutcome(trace, DEMO_PLAN);
  const text = renderBrief('ours', trace, DEMO_PLAN, outcome, { mode: 'freeze', seed: 7, onset: 5, k: 1 });

  it('contains every section header and at most 40 play-by-play lines', () => {
    for (const h of ["COMMANDER'S BRIEF", 'Situation', 'Play by play', 'Outcome']) expect(text).toContain(h);
    const play = text.split('Play by play')[1]!.split('Outcome')[0]!.split('\n').filter((l) => /^\s+t=\s*\d+\s{2}/.test(l));
    expect(play.length).toBeLessThanOrEqual(MAX_PLAY_BY_PLAY);
    expect(play.length).toBe(Math.min(MAX_PLAY_BY_PLAY, outcome.events.length));
    expect(text).toContain('Seed 7');
    expect(text).toContain('Failure mode: freeze from tick 5, k=1');
    expect(text.trim().split('\n').pop()).toBe(closing(outcome));
  });

  it('is byte-identical on two calls and has no API call anywhere in the module', () => {
    expect(renderBrief('ours', trace, DEMO_PLAN, outcome, { mode: 'freeze', seed: 7, onset: 5, k: 1 })).toBe(text);
    const src = readFileSync(new URL('./brief.ts', import.meta.url), 'utf8') + readFileSync(new URL('./brief-cli.ts', import.meta.url), 'utf8');
    expect(/fetch\(|https?:\/\//.test(src)).toBe(false);
  });

  it('the closing sentence is chosen by outcome', () => {
    const base: Outcome = { fireVolume: 10, peakBurning: 2, spacesBurnedOut: [], containedAt: null, extinguishedAt: null, dronesUsed: {}, tetherTicks: 0, retardantSpent: 0, droneDeaths: {}, wrongFloor: 0, hedges: 0, events: [] };
    expect(closing(base)).toContain('not contained');
    expect(closing({ ...base, containedAt: 3 })).toContain('contained from tick 3');
    expect(closing({ ...base, containedAt: 3, extinguishedAt: 9 })).toContain('put out at tick 9');
  });

  it('caps a long play by play at 40 lines and says how many were cut', () => {
    const many: Outcome = { fireVolume: 0, peakBurning: 0, spacesBurnedOut: [], containedAt: null, extinguishedAt: null, dronesUsed: {}, tetherTicks: 0, retardantSpent: 0, droneDeaths: {}, wrongFloor: 0, hedges: 0, events: Array.from({ length: 55 }, (_, i) => ({ t: i, kind: 'dispatch' as const, text: `event ${i}` })) };
    const t = renderBrief('x', trace, DEMO_PLAN, many, { mode: 'none', seed: 1 });
    expect(t.split('\n').filter((l) => /^\s+t=\s*\d+\s{2}/.test(l)).length).toBe(40);
    expect(t).toContain('15 more events not shown');
  });
});

describe('brief CLI', () => {
  it('end to end on demo-6 freeze seed 7, 60 ticks, three brains: every outcome field finite or null, one table row per brain, files written', () => {
    const o = parseBriefArgs(['--plan', 'demo-6', '--mode', 'freeze', '--seed', '7', '--ticks', '60']);
    expect(o.brains).toEqual(['ours', 'kalman', 'kalman-source']);
    const { runs, file } = runBriefs(o);
    expect(runs.map((r) => r.name)).toEqual(['ours', 'kalman', 'kalman-source']);
    for (const r of runs) {
      for (const col of TABLE_COLUMNS) {
        const v = cell(r.outcome, col);
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      expect(r.trace.length).toBe(60);
      expect(r.brief).toContain(`COMMANDER'S BRIEF: ${r.name}`);
    }
    const table = formatTable(runs);
    const rows = table.split('\n');
    expect(rows.length).toBe(1 + 3);
    expect(rows[1]!.startsWith('ours')).toBe(true);
    // The baselines dispatch (same allocator) and never hedge (one hypothesis).
    for (const r of runs.slice(1)) {
      expect(r.trace.some((t) => t.commands.some((c) => c.task !== 'hold'))).toBe(true);
      expect(r.outcome.hedges).toBe(0);
    }
    // Written files: .md with the table and every brief, .json = the BriefFile shape.
    const dir = mkdtempSync(join(tmpdir(), 'firefly-brief-'));
    const paths = writeBrief({ ...o, outDir: dir }, runs, file);
    expect(paths.md.endsWith('brief-demo-6-freeze-7.md')).toBe(true);
    const md = readFileSync(paths.md, 'utf8');
    for (const r of runs) expect(md).toContain(r.brief);
    const json = JSON.parse(readFileSync(paths.json, 'utf8')) as typeof file;
    expect(json.brains.map((b) => b.name)).toEqual(['ours', 'kalman', 'kalman-source']);
    expect(json.target).toEqual(['S3']);
    expect(json.onset).toBe(5);
    expect(json.k).toBe(1);
  });

  it('parses and rejects flags; the default brains exist', () => {
    expect(parseBriefArgs([]).plan).toBe('vessel-3x8');
    expect(parseBriefArgs(['--brains', 'ours,kalman-source']).brains).toEqual(['ours', 'kalman-source']);
    expect(() => parseBriefArgs(['--brains', 'nope'])).toThrow(/--brains/);
    expect(() => parseBriefArgs(['--mode', 'bogus'])).toThrow(/--mode/);
    expect(() => parseBriefArgs(['--ticks', '0'])).toThrow(/--ticks/);
    expect(() => parseBriefArgs(['--plan', 'nope'])).toThrow(/unknown plan/);
    for (const b of ['ours', 'kalman', 'kalman-source']) expect(BRIEF_BRAINS[b]).toBeDefined();
  });
});
