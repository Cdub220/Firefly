import { describe, expect, it } from 'vitest';
import { hedgeInfo } from './hedge';

describe('hedgeInfo', () => {
  it('is a hedge only when two or more commands target different spaces inside one ambiguous group', () => {
    const amb = [['S2', 'S4'], ['S6']];
    expect(hedgeInfo({ ambiguous: amb }, [])).toEqual({ hedging: false, drones: [], groups: [] });
    expect(hedgeInfo({ ambiguous: amb }, [{ droneId: 'D1', goTo: 'S2', task: 'observe' }])).toMatchObject({ hedging: false });
    expect(hedgeInfo({ ambiguous: amb }, [{ droneId: 'D1', goTo: 'S2', task: 'observe' }, { droneId: 'D2', goTo: 'S2', task: 'observe' }])).toMatchObject({ hedging: false });
    const h = hedgeInfo({ ambiguous: amb }, [
      { droneId: 'D1', goTo: 'S2', task: 'observe' }, { droneId: 'D2', goTo: 'S4', task: 'observe' }, { droneId: 'D3', goTo: 'S1', task: 'hold' },
    ]);
    expect(h.hedging).toBe(true);
    expect(h.drones.sort()).toEqual(['D1', 'D2']);
    expect(h.groups).toEqual([['S2', 'S4']]);
  });

  it('one drone commanded twice is not a hedge: only its last command counts', () => {
    const amb = [['S2', 'S4']];
    expect(hedgeInfo({ ambiguous: amb }, [{ droneId: 'D1', goTo: 'S2', task: 'observe' }, { droneId: 'D1', goTo: 'S4', task: 'observe' }]).hedging).toBe(false);
    const h = hedgeInfo({ ambiguous: amb }, [{ droneId: 'D1', goTo: 'S2', task: 'observe' }, { droneId: 'D1', goTo: 'S4', task: 'observe' }, { droneId: 'D2', goTo: 'S2', task: 'observe' }]);
    expect(h.hedging).toBe(true); // D1 ends at S4, D2 at S2
    expect(h.drones.sort()).toEqual(['D1', 'D2']);
  });

  it('ignores singleton groups and commands outside groups; no ambiguity means no hedge', () => {
    expect(hedgeInfo({ ambiguous: [['S2'], ['S4']] }, [{ droneId: 'D1', goTo: 'S2', task: 'observe' }, { droneId: 'D2', goTo: 'S4', task: 'observe' }]).hedging).toBe(false);
    expect(hedgeInfo({ ambiguous: [] }, [{ droneId: 'D1', goTo: 'S2', task: 'observe' }, { droneId: 'D2', goTo: 'S4', task: 'observe' }]).hedging).toBe(false);
  });

  it('reports every hedged group and does not mutate its inputs', () => {
    const amb = [['S2', 'S4'], ['S5', 'S6']];
    const cmds = [
      { droneId: 'D1', goTo: 'S2', task: 'observe' }, { droneId: 'D2', goTo: 'S4', task: 'observe' },
      { droneId: 'D3', goTo: 'S5', task: 'suppress' }, { droneId: 'D4', goTo: 'S6', task: 'suppress' },
    ];
    const before = JSON.stringify([amb, cmds]);
    const h = hedgeInfo({ ambiguous: amb }, cmds);
    expect(h.groups).toEqual(amb);
    expect(h.drones.sort()).toEqual(['D1', 'D2', 'D3', 'D4']);
    expect(JSON.stringify([amb, cmds])).toBe(before);
  });
});
