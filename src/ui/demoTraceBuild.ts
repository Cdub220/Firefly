/**
 * Build the recorded demo trace by running the script beats in order, exactly as the
 * buttons would: same beatConfig, same open-loop/closed-loop rule, same brains. Pure
 * apart from the simulation; the CLI wrapper (export-trace.ts) does the file I/O.
 */
import { runLoopMulti, type TickRecord } from '../loop';
import { loadPlan, PLAN_NAMES } from '../shared/structures';
import type { StructurePlan } from '../shared/types';
import { BEATS, BRAIN_FACTORIES, H2H_FACTORIES, PRIMARY, beatConfig, sanitizeIgnition, type Beat, type Corr } from './store';
import { DEMO_TRACE_VERSION, type DemoBeatRecord, type DemoTrace } from './demoTrace';

export type BuildOptions = { seed: number; ticks: number; startPlan: string; beats?: readonly Beat[]; now?: () => string };

export const BUILD_DEFAULTS: BuildOptions = { seed: 42, ticks: 60, startPlan: PLAN_NAMES[0] ?? 'demo-6' };

export function buildDemoTrace(opts: Partial<BuildOptions> = {}): DemoTrace {
  const o = { ...BUILD_DEFAULTS, ...opts };
  const beats = o.beats ?? BEATS.map((b) => b.key);
  let planName = o.startPlan;
  let plan: StructurePlan = loadPlan(planName);
  let ignition = sanitizeIgnition(undefined, plan);
  let corruption: Corr = { mode: 'none' };
  const records: DemoBeatRecord[] = [];
  for (const beat of beats) {
    const cfg = beatConfig(beat, { planName, plan, ignition, corruption, seed: o.seed });
    planName = cfg.planName;
    plan = loadPlan(planName);
    ignition = cfg.ignition;
    corruption = cfg.corruption;
    const runPlan = { ...plan, ignition: [ignition] };
    const common = { plan: runPlan, seed: o.seed, ticks: o.ticks, corruption };
    if (beat === 'compare') {
      const traces = runLoopMulti({ ...common, brains: H2H_FACTORIES, primary: PRIMARY, dispatch: true });
      const compare: Record<string, TickRecord[]> = { [PRIMARY]: traces[PRIMARY]! };
      for (const primary of Object.keys(H2H_FACTORIES)) {
        if (primary !== PRIMARY) compare[primary] = runLoopMulti({ ...common, brains: H2H_FACTORIES, primary, dispatch: true })[primary]!;
      }
      records.push({ beat, planName, ignition, seed: o.seed, ticks: o.ticks, corruption, caption: cfg.caption, closedLoop: true, traces, compare });
    } else {
      const traces = runLoopMulti({ ...common, brains: BRAIN_FACTORIES.both, primary: PRIMARY, dispatch: false });
      records.push({ beat, planName, ignition, seed: o.seed, ticks: o.ticks, corruption, caption: cfg.caption, closedLoop: false, traces });
    }
  }
  // No timestamp by default: the file is then byte-identical run to run (see export-trace.ts --stamp).
  return { version: DEMO_TRACE_VERSION, exportedAt: (o.now ?? (() => ''))(), beats: records };
}
