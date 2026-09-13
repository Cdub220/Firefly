/**
 * The only file that wires world + corruption + brain together.
 *
 *   world.tick(commands) -> corruptor.apply(obs) -> brain.step(obs') -> commands
 *
 * Exported runLoop() is used by the eval harness, the UI, and tests. runLoopMulti() runs
 * ONE world and ONE corruptor and feeds the same corrupted observation to every brain, so
 * baseline comparisons are on byte-identical inputs. When executed directly
 * (`npm run sim`), it prints truth and both brains' beliefs, one line per tick.
 */
import { createWorld } from './world';
import { createCorruptor } from './corruption';
import { createBrain } from './brain';
import { createKalmanBrain } from './brain/kalman';
import demoPlan from '../data/structures/demo-6.json';
import type {
  Belief, Brain, BrainConfig, Command, CorruptionConfig, CorruptionMode, Observation,
  SpaceId, StructurePlan, WorldState,
} from './shared/types';

export type TickRecord = {
  t: number;
  truth: WorldState;
  obs: Observation; // post-corruption, i.e. exactly what the brain saw
  belief: Belief;
  commands: Command[];
  /** Wall-clock milliseconds spent in brain.step for this tick (performance.now around the call only). */
  stepMs: number;
  /**
   * The corruption onset the loop ran with (CorruptionConfig.onset, default 5), or null
   * when the mode is 'none'. Carried on every record so a trace is self-describing for
   * the metrics. (Additive, Dean, CP3 prompt 1.)
   */
  onset: number | null;
};

/** The onset a corruption config implies for the metrics window: null for a clean run. */
export function onsetOf(corruption: Omit<CorruptionConfig, 'seed'> | undefined): number | null {
  if (!corruption || corruption.mode === 'none') return null;
  return corruption.onset ?? DEFAULT_ONSET;
}
const DEFAULT_ONSET = 5; // mirrors DEFAULT_CORRUPTION.onset in src/corruption

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export type BrainFactory = (cfg: BrainConfig) => Brain;

export type LoopConfig = {
  plan: StructurePlan;
  seed: number;
  ticks: number;
  /** Full corruption knobs minus seed (the loop supplies it). Default { mode: 'none' }. */
  corruption?: Omit<CorruptionConfig, 'seed'>;
  /** Which brain to run. Default createBrain (ours). */
  brain?: BrainFactory;
  onTick?: (rec: TickRecord) => void;
};

export function runLoop(cfg: LoopConfig): TickRecord[] {
  const world = createWorld({ plan: cfg.plan, seed: cfg.seed });
  const corruptor = createCorruptor({ seed: cfg.seed, mode: 'none', ...cfg.corruption });
  const makeBrain = cfg.brain ?? createBrain;
  const brain = makeBrain({ plan: cfg.plan, seed: cfg.seed });

  const onset = onsetOf(cfg.corruption);
  const trace: TickRecord[] = [];
  let commands: Command[] = [];
  for (let i = 0; i < cfg.ticks; i++) {
    const { truth, obs } = world.tick(commands);
    const seen = corruptor.apply(obs);
    const t0 = now();
    const out = brain.step(seen);
    const stepMs = now() - t0;
    commands = out.commands;
    const rec: TickRecord = { t: truth.t, truth, obs: seen, belief: out.belief, commands, stepMs, onset };
    trace.push(rec);
    cfg.onTick?.(rec);
  }
  return trace;
}

export type MultiLoopConfig = Omit<LoopConfig, 'brain'> & {
  brains: Record<string, BrainFactory>;
  /** Whose commands drive the world. Default: the first key of `brains`. */
  primary?: string;
};

/**
 * One world, one corruptor, every brain fed the same corrupted observation each tick.
 * Each brain's trace records its own belief and commands; only the primary brain's
 * commands are applied to the world.
 */
export function runLoopMulti(cfg: MultiLoopConfig): Record<string, TickRecord[]> {
  const names = Object.keys(cfg.brains);
  if (names.length === 0) throw new Error('runLoopMulti: no brains given');
  const primary = cfg.primary ?? names[0]!;
  if (!(primary in cfg.brains)) throw new Error(`runLoopMulti: unknown primary "${primary}"`);

  const world = createWorld({ plan: cfg.plan, seed: cfg.seed });
  const corruptor = createCorruptor({ seed: cfg.seed, mode: 'none', ...cfg.corruption });
  const brains = names.map((name) => ({
    name,
    brain: cfg.brains[name]!({ plan: cfg.plan, seed: cfg.seed }),
  }));

  const onset = onsetOf(cfg.corruption);
  const traces: Record<string, TickRecord[]> = Object.fromEntries(names.map((n) => [n, []]));
  let commands: Command[] = [];
  for (let i = 0; i < cfg.ticks; i++) {
    const { truth, obs } = world.tick(commands);
    const seen = corruptor.apply(obs);
    for (const { name, brain } of brains) {
      // Each brain gets its own deep copy: byte-identical inputs as a guarantee, and a
      // brain that mutates its observation cannot contaminate the others or the traces.
      const own = structuredClone(seen);
      const t0 = now();
      const out = brain.step(own);
      const stepMs = now() - t0;
      const rec: TickRecord = { t: truth.t, truth, obs: own, belief: out.belief, commands: out.commands, stepMs, onset };
      traces[name]!.push(rec);
      if (name === primary) {
        commands = out.commands;
        cfg.onTick?.(rec);
      }
    }
  }
  return traces;
}

export const DEMO_PLAN = demoPlan as StructurePlan;

export function formatTick(rec: TickRecord): string {
  const trueBurning = rec.truth.spaces.filter((s) => s.burning).map((s) => s.id).join(',') || '-';
  const believed = rec.belief.burningSet.join(',') || '-';
  const maxErr = Math.max(
    0,
    ...rec.truth.spaces.map((s) => Math.abs((rec.belief.estimate[s.id] ?? 0) - s.temp)),
  );
  const amb = rec.belief.ambiguous.length ? ` amb=${rec.belief.ambiguous.map((g) => g.join('|')).join(';')}` : '';
  return (
    `t=${String(rec.t).padStart(3)} truth=[${trueBurning}] belief=[${believed}]` +
    ` conf=${rec.belief.confidence.toFixed(2)} maxErr=${maxErr.toFixed(1)}C` +
    ` readings=${rec.obs.readings.length} cmds=${rec.commands.length}${amb}`
  );
}

const meanAbsErr = (rec: TickRecord): number => {
  const errs = rec.truth.spaces.map((s) => Math.abs((rec.belief.estimate[s.id] ?? 0) - s.temp));
  return errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
};

/** One line comparing every brain's belief against truth for the same tick. */
export function formatTickMulti(recs: Record<string, TickRecord>): string {
  const names = Object.keys(recs);
  const first = recs[names[0]!]!;
  const trueBurning = first.truth.spaces.filter((s) => s.burning).map((s) => s.id).join(',') || '-';
  const perBrain = names
    .map((n) => {
      const r = recs[n]!;
      return `${n}=[${r.belief.burningSet.join(',') || '-'}] c=${r.belief.confidence.toFixed(2)}`;
    })
    .join(' ');
  const errs = names.map((n) => meanAbsErr(recs[n]!).toFixed(1)).join('/');
  return `t=${String(first.t).padStart(3)} truth=[${trueBurning}] ${perBrain} err=${errs} rd=${first.obs.readings.length}`;
}

type CliArgs = {
  ticks: number;
  seed: number;
  corruption: Omit<CorruptionConfig, 'seed'>;
};

function parseArgs(argv: string[]): CliArgs {
  const getNum = (flag: string): number | undefined => {
    const i = argv.indexOf(flag);
    const v = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isFinite(v) ? v : undefined;
  };
  const getStr = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const modes: CorruptionMode[] = ['none', 'freeze', 'blind', 'saturate', 'flashover', 'mixed'];
  const rawMode = getStr('--mode') ?? 'none';
  if (!(modes as string[]).includes(rawMode)) {
    throw new Error(`--mode ${rawMode}: expected one of ${modes.join(', ')}`);
  }
  const corruption: Omit<CorruptionConfig, 'seed'> = { mode: rawMode as CorruptionMode };
  const k = getNum('--k');
  if (k !== undefined) corruption.k = k;
  const onset = getNum('--onset');
  if (onset !== undefined) corruption.onset = onset;
  const target = getStr('--target');
  if (target !== undefined) corruption.target = target.split(',').filter(Boolean) as SpaceId[];
  return { ticks: getNum('--ticks') ?? 50, seed: getNum('--seed') ?? 42, corruption };
}

// CLI entry guard. `process` does not exist in the browser, and src/ui imports this module,
// so the check must be safe there or the whole page fails to mount.
const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const { ticks, seed, corruption } = parseArgs(process.argv.slice(2));
  console.log(
    `firefly sim  plan=${DEMO_PLAN.name}  seed=${seed}  ticks=${ticks}  corruption=${JSON.stringify(corruption)}`,
  );
  const traces = runLoopMulti({
    plan: DEMO_PLAN,
    seed,
    ticks,
    corruption: { ...corruption, ambient: DEMO_PLAN.ambient },
    brains: { ours: createBrain, kalman: createKalmanBrain },
    primary: 'ours',
  });
  for (let i = 0; i < ticks; i++) {
    console.log(formatTickMulti(Object.fromEntries(Object.keys(traces).map((n) => [n, traces[n]![i]!]))));
  }
}
