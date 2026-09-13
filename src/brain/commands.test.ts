/**
 * The command hook: planCommands() returns no commands today, and step() gets its
 * commands from it (so the CP4 allocator plugs in without touching a frozen file).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from './index';
import { planCommands, type PlanCommandsInput } from './commands';
import type { Command, Observation, Reading, StructurePlan } from '../shared/types';

vi.mock('./commands', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./commands')>();
  return { ...mod, planCommands: vi.fn(mod.planCommands) };
});
const hook = vi.mocked(planCommands);

const plan: StructurePlan = {
  name: 'test-3',
  ambient: 20,
  spaces: [{ id: 'S1', level: 1 }, { id: 'S2', level: 1 }, { id: 'S3', level: 1 }],
  edges: [{ a: 'S1', b: 'S2', kind: 'door', rate: 0.1 }, { a: 'S2', b: 'S3', kind: 'door', rate: 0.1 }],
  sensors: [{ id: 'F1', spaceId: 'S1' }, { id: 'F2', spaceId: 'S2' }, { id: 'F3', spaceId: 'S3' }],
  resupply: ['S1'],
  ignition: ['S1'],
};
const reading = (sensorId: string, spaceId: string, temp: number, t: number): Reading => ({ sensorId, source: 'fixed', spaceId, temp, t });
const obs = (t: number, readings: Reading[] = [reading('F1', 'S1', 450, t), reading('F2', 'S2', 60, t), reading('F3', 'S3', 20, t)]): Observation => ({
  t,
  readings,
  drones: [{ id: 'D1', class: 'scout', at: 'S1', resource: 1, alive: true, linked: true }],
});

describe('planCommands', () => {
  afterEach(() => {
    hook.mockClear();
  });

  it('returns [] today for any input', () => {
    const input: PlanCommandsInput = {
      plan,
      belief: { estimate: {}, burningSet: ['S1'], ambiguous: [['S2'], ['S3']], suspectSensors: [], confidence: 0.5, probability: {} },
      kept: [new Set(['S1', 'S2']), new Set(['S1', 'S3'])],
      drones: obs(1).drones,
      prev: [{ droneId: 'D1', goTo: 'S2', task: 'observe' }],
    };
    expect(planCommands(input)).toEqual([]);
  });

  it('step() returns exactly what the hook returns, and hands it the kept hypotheses, the drones and last tick\'s commands', () => {
    const brain = createBrain({ plan, seed: 42 });
    const first = brain.step(obs(1));
    expect(first.commands).toEqual([]);
    expect(hook).toHaveBeenCalledTimes(1);
    const a = hook.mock.calls[0]![0];
    expect(a.plan).toBe(plan);
    expect(a.belief).toBe(first.belief);
    expect(a.kept.length).toBeGreaterThan(0);
    for (const s of a.kept) expect(s).toBeInstanceOf(Set);
    expect(a.drones.map((d) => d.id)).toEqual(['D1']);
    expect(a.prev).toEqual([]);

    // Whatever the hook says goes out, and comes back as prev next tick.
    const sentinel: Command[] = [{ droneId: 'D1', goTo: 'S2', task: 'observe' }];
    hook.mockReturnValueOnce(sentinel);
    const second = brain.step(obs(2));
    expect(second.commands).toBe(sentinel);
    const third = brain.step(obs(3));
    expect(hook.mock.calls[2]![0].prev).toBe(sentinel);
    expect(third.commands).toEqual([]);

    // Under a total blackout the hook still runs, with the carried-forward set as the one hypothesis.
    const dark = brain.step({ ...obs(4), readings: [] });
    const d = hook.mock.calls[3]![0];
    expect(d.kept).toEqual([new Set(dark.belief.burningSet)]);
    expect(dark.commands).toEqual([]);

    // reset() clears prev.
    brain.reset();
    brain.step(obs(1));
    expect(hook.mock.calls[4]![0].prev).toEqual([]);
  });
});
