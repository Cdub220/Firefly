/**
 * The recorded demo trace: one entry per script beat, each carrying the full config it
 * ran with and the raw traces, so the UI can replay a beat without simulating. Written by
 * `npm run export:trace` (src/ui/export-trace.ts), read by the "load trace" control.
 * This file is the shape and its parser only: no store, no fs.
 */
import type { TickRecord } from '../loop';
import type { CorruptionConfig } from '../shared/types';

export const DEMO_TRACE_VERSION = 1;

export type DemoBeatRecord = {
  beat: string;
  planName: string;
  ignition: string;
  seed: number;
  ticks: number;
  corruption: Omit<CorruptionConfig, 'seed'>;
  closedLoop: boolean;
  /** Per-brain traces of the main run (what the split view and belief scenes show). */
  traces: Record<string, TickRecord[]>;
  /** Head-to-head traces keyed by driving brain; only on the compare beat. */
  compare?: Record<string, TickRecord[]>;
};

export type DemoTrace = {
  version: number;
  /** ISO time the file was written; informational. */
  exportedAt: string;
  beats: DemoBeatRecord[];
};

export type ParsedDemoTrace = { ok: true; trace: DemoTrace } | { ok: false; why: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One record has the fields the loop writes and the store reads; the rest is trusted as data. */
function looksLikeTick(v: unknown): v is TickRecord {
  if (!isObj(v)) return false;
  const truth = v['truth'];
  const belief = v['belief'];
  return typeof v['t'] === 'number' && isObj(truth) && Array.isArray(truth['spaces']) && Array.isArray(truth['drones'])
    && isObj(v['obs']) && isObj(belief) && Array.isArray(belief['burningSet']) && Array.isArray(v['commands']);
}

function parseTraces(v: unknown, where: string): { ok: true; traces: Record<string, TickRecord[]> } | { ok: false; why: string } {
  if (!isObj(v)) return { ok: false, why: `${where}: traces must be an object keyed by brain` };
  const names = Object.keys(v);
  if (names.length === 0) return { ok: false, why: `${where}: no brains in traces` };
  const traces: Record<string, TickRecord[]> = {};
  let len = -1;
  for (const name of names) {
    const t = v[name];
    if (!Array.isArray(t) || t.length === 0) return { ok: false, why: `${where}: trace "${name}" is empty or not an array` };
    if (!t.every(looksLikeTick)) return { ok: false, why: `${where}: trace "${name}" has a record that is not a tick` };
    if (len >= 0 && t.length !== len) return { ok: false, why: `${where}: brains have different trace lengths` };
    len = t.length;
    traces[name] = t as TickRecord[];
  }
  return { ok: true, traces };
}

/** Validate a parsed JSON value as a DemoTrace. Rejects loudly; never throws. */
export function parseDemoTrace(json: unknown): ParsedDemoTrace {
  if (!isObj(json)) return { ok: false, why: 'not a JSON object' };
  if (json['version'] !== DEMO_TRACE_VERSION) return { ok: false, why: `version ${String(json['version'])} is not ${DEMO_TRACE_VERSION}` };
  const beats = json['beats'];
  if (!Array.isArray(beats) || beats.length === 0) return { ok: false, why: 'no beats' };
  const out: DemoBeatRecord[] = [];
  const seen = new Set<string>();
  for (const [i, b] of beats.entries()) {
    const where = `beat ${i}`;
    if (!isObj(b)) return { ok: false, why: `${where}: not an object` };
    const beat = b['beat'];
    if (typeof beat !== 'string' || beat === '') return { ok: false, why: `${where}: missing beat key` };
    if (seen.has(beat)) return { ok: false, why: `${where}: beat "${beat}" appears twice` };
    seen.add(beat);
    if (typeof b['planName'] !== 'string' || typeof b['ignition'] !== 'string') return { ok: false, why: `${where} (${beat}): planName and ignition must be strings` };
    if (typeof b['seed'] !== 'number' || typeof b['ticks'] !== 'number' || !Number.isFinite(b['seed']) || !Number.isFinite(b['ticks'])) return { ok: false, why: `${where} (${beat}): seed and ticks must be numbers` };
    const corruption = b['corruption'];
    if (!isObj(corruption) || typeof corruption['mode'] !== 'string') return { ok: false, why: `${where} (${beat}): corruption.mode missing` };
    const traces = parseTraces(b['traces'], `${where} (${beat})`);
    if (!traces.ok) return traces;
    if (traces.traces[Object.keys(traces.traces)[0]!]!.length !== b['ticks']) return { ok: false, why: `${where} (${beat}): trace length is not ticks` };
    let compare: Record<string, TickRecord[]> | undefined;
    if (b['compare'] !== undefined) {
      const c = parseTraces(b['compare'], `${where} (${beat}) compare`);
      if (!c.ok) return c;
      compare = c.traces;
    }
    out.push({
      beat, planName: b['planName'], ignition: b['ignition'], seed: b['seed'], ticks: b['ticks'],
      corruption: corruption as Omit<CorruptionConfig, 'seed'>, closedLoop: b['closedLoop'] === true, traces: traces.traces,
      ...(compare ? { compare } : {}),
    });
  }
  return { ok: true, trace: { version: DEMO_TRACE_VERSION, exportedAt: typeof json['exportedAt'] === 'string' ? json['exportedAt'] : '', beats: out } };
}
