import { describe, expect, it } from 'vitest';
import timeline from '../../data/incidents/one-meridian-plaza/timeline.json';
import { runLoop } from '../loop';
import { loadPlan } from '../shared/structures';
import { commanderBelief, createCommander, stageAt, type KnowledgeStage } from './commander';

const stages = timeline.commanderKnowledge as KnowledgeStage[];
const plan = loadPlan('highrise-12x9');

describe('the 1991 commander baseline', () => {
  it('stageAt picks the last stage at or before the minute', () => {
    expect(stageAt(stages, 0).floors).toEqual([]);
    expect(stageAt(stages, 7).floors).toEqual([]);
    expect(stageAt(stages, 8).floors).toEqual([22]);
    expect(stageAt(stages, 79).floors).toEqual([22]);
    expect(stageAt(stages, 80).floors).toEqual([22, 23, 24]);
    expect(stageAt(stages, 1117).floors).toEqual([27, 28, 29, 30]);
    expect(stageAt(stages, 5000).floors).toEqual([]);
    expect(stageAt([], 50)).toEqual({ minute: 0, floors: [], confidence: 0 });
  });

  it('maps known floors to their office zones with the stage confidence, every space present', () => {
    const b = commanderBelief(plan, { minute: 80, floors: [22, 23, 24], confidence: 0.9 });
    expect(b.burningSet.sort()).toEqual(['L22-A1', 'L22-A2', 'L22-A3', 'L22-A4', 'L23-A1', 'L23-A2', 'L23-A3', 'L23-A4', 'L24-A1', 'L24-A2', 'L24-A3', 'L24-A4']);
    expect(b.confidence).toBe(0.9);
    expect(b.ambiguous).toEqual([]);
    expect(b.suspectSensors).toEqual([]);
    expect(Object.keys(b.probability)).toHaveLength(plan.spaces.length);
    expect(b.probability['L22-A3']).toBe(0.9);
    expect(b.probability['L22-B1']).toBe(0);
    expect(b.estimate['L22-A3']).toBe(700);
    expect(b.estimate['L25-A1']).toBe(plan.ambient);
    const nothing = commanderBelief(plan, { minute: 0, floors: [], confidence: 0 });
    expect(nothing.burningSet).toEqual([]);
    expect(nothing.confidence).toBe(0);
  });

  it('runs in the loop, ignores sensors entirely, issues no commands, and knows the fire floor at minute 8', () => {
    const brain = createCommander(stages);
    const clean = runLoop({ plan, seed: 42, ticks: 30, brain });
    const blind = runLoop({ plan, seed: 42, ticks: 30, brain, corruption: { mode: 'blind', k: 3, onset: 1 } });
    expect(clean.map((r) => r.belief)).toEqual(blind.map((r) => r.belief)); // no sensor could change its mind
    expect(clean.every((r) => r.commands.length === 0)).toBe(true);
    // tick 1 = minute 4: nothing known; tick 2 = minute 8: floor 22.
    expect(clean[0]!.belief.burningSet).toEqual([]);
    expect(clean[1]!.belief.burningSet).toContain('L22-A3');
    expect(clean[1]!.belief.confidence).toBe(0.9);
    // tick 20 = minute 80: three floors.
    expect(new Set(clean[19]!.belief.burningSet.map((id) => id.slice(0, 3)))).toEqual(new Set(['L22', 'L23', 'L24']));
  });
});
