/**
 * The only file that wires world + corruption + brain together.
 *
 *   world.tick(commands) -> corruptor.apply(obs) -> brain.step(obs') -> commands
 *
 * Exported runLoop() is used by the eval harness, the UI, and tests. When executed
 * directly (`npm run sim`), it prints one compact line per tick.
 */
import { createWorld } from './world';
import { createCorruptor } from './corruption';
import { createBrain } from './brain';
import demoPlan from '../data/structures/demo-6.json';
import type {
  Belief, Command, CorruptionConfig, Observation, StructurePlan, WorldState,
} from './shared/types';

export type TickRecord = {
  t: number;
  truth: WorldState;
  obs: Observation; // post-corruption, i.e. exactly what the brain saw
  belief: Belief;
  commands: Command[];
};

export type LoopConfig = {
  plan: StructurePlan;
  seed: number;
  ticks: number;
  corruption?: CorruptionConfig['mode'];
  onTick?: (rec: TickRecord) => void;
};

export function runLoop(cfg: LoopConfig): TickRecord[] {
  const world = createWorld({ plan: cfg.plan, seed: cfg.seed });
  const corruptor = createCorruptor({ seed: cfg.seed, mode: cfg.corruption ?? 'none' });
  const brain = createBrain({ plan: cfg.plan, seed: cfg.seed });

  const trace: TickRecord[] = [];
  let commands: Command[] = [];
  for (let i = 0; i < cfg.ticks; i++) {
    const { truth, obs } = world.tick(commands);
    const seen = corruptor.apply(obs);
    const out = brain.step(seen);
    commands = out.commands;
    const rec: TickRecord = { t: truth.t, truth, obs: seen, belief: out.belief, commands };
    trace.push(rec);
    cfg.onTick?.(rec);
  }
  return trace;
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

function parseArgs(argv: string[]): { ticks: number; seed: number } {
  const get = (flag: string, dflt: number): number => {
    const i = argv.indexOf(flag);
    const v = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isFinite(v) ? v : dflt;
  };
  return { ticks: get('--ticks', 50), seed: get('--seed', 42) };
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const { ticks, seed } = parseArgs(process.argv.slice(2));
  console.log(`firefly sim  plan=${DEMO_PLAN.name}  seed=${seed}  ticks=${ticks}`);
  runLoop({ plan: DEMO_PLAN, seed, ticks, onTick: (rec) => console.log(formatTick(rec)) });
}
