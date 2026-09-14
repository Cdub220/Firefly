# 09 · Same brain, different building

Nothing in `src/` names a ship or a tower. A structure is a JSON file in `data/structures/` with spaces, levels, sensors and per-edge heat-transfer rates; the estimator, the corruption model and the allocator read the file and nothing else. This page is the twenty-second proof: the two plan files side by side, the command that runs both, and the two scorecard rows.

## The two files, conceptually

| | `vessel-3x8` | `tower-5x4` |
|---|---|---|
| Shape | 3 levels × 8 spaces (24), decks joined by floor edges everywhere | 5 levels × 4 spaces (20), one shaft column |
| door | 0.15 | 0.15 |
| passage | 0.20 | 0.15 |
| floor (level to level) | 0.08 on 16 edges | 0.04 on 16 edges |
| shaft | 0.30 on 2 edges | 0.35 on 4 edges (one stair chain, L1 to L5) |
| sensors | one per space | one per space on L1, L2, L3, L5; **none on L4** |
| ignition | L1-B3 | L2-B2 |

The rates encode two different physics. A steel hull conducts: every deck plate is a heat path, so the vessel's floor rate is twice the tower's and heat leaks upward more or less everywhere. A concrete high-rise insulates between floors (0.04) but has one stairwell where the stack effect drives hot gas straight up (0.35 on a single vertical chain). Same equations in `src/world/physics.ts` and in the brain's rollout; only the numbers differ, and they differ in the file, not in code. The unsensed fourth floor is deliberate: the tower is also the plan where the brain must infer a whole level from its neighbours.

## Run both

```
npx tsx src/loop.ts --plan vessel-3x8 --ticks 120 --mode flashover --k 2
npx tsx src/loop.ts --plan tower-5x4  --ticks 120 --mode flashover --k 2
npm run sweep -- --plans tower-5x4 --quick        # rewrites results/sweep-latest.json; git checkout it afterwards
```

The tower run (seed 42): ours tracks the fire at L2-B2 from tick 1, holds `L2-A2, L2-B1, L2-B2` at tick 20 as it spreads on the floor, then flashover kills every sensor near the fire and by tick 30 twelve spaces burn with the brain reporting confidence 0.05 and a burning set it knows it cannot defend. Kalman reports `L2-B2` at 0.94 on tick 1 and, once the sensors die, all twenty spaces burning at 0.7 until the run ends 24 ticks after the last flame is out. Neither brain saw a tower before; neither has a setting for one. Full output: `npx tsx src/loop.ts --plan tower-5x4 --ticks 120 --mode flashover --k 2`. The quick sweep on the tower alone (120 cells × 4 brains, 60 ticks, seeds 1-2) is in `results/sweep-tower-quick.txt`; its `WHERE OURS LOSES` section is empty.

## The two scorecard rows

Means over the full sweep (`results/sweep-latest.json`: 5 modes × k 1-3 × 4 target kinds × 10 seeds × 120 ticks = 600 cells per plan per brain), folded by `npm run gen:sweep-summary` into `src/ui/sweepSummary.json`, which the Head to head scorecard shows under the live run for whichever plan is loaded.

| plan | brain | false certainty | wrong dispatch | coverage | recovery (ticks, of cells that recovered) |
|---|---|---|---|---|---|
| vessel-3x8 | ours | 0.0% | 14.4% | 88.6% | 79.8 (86% recovered) |
| vessel-3x8 | kalman | 89.1% | 95.7% | 87.5% | 29.0 (5% recovered) |
| tower-5x4 | ours | 0.0% | 10.8% | 90.4% | 0 (100%: never needed to recover) |
| tower-5x4 | kalman | 82.7% | 86.4% | 83.6% | 20.7 (85% recovered) |

The estimator was frozen on Sunday midnight (`docs/06-freeze.md`) before either of these tables was made, with the same code path for both files. That is the claim: the plan is data, the brain is one function of it.

## What a real building would need

An alarm-panel export (zones, doors, stair and duct connections) becomes the plan file, with rates from the building's fire-compartment ratings; sprinkler flow switches and duct thermistors become fixed sensors; the drones become whatever mobile readings the site has, and the rest of this repository runs unchanged.
