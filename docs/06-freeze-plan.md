# Freeze plan · written before the freeze

Written Sun Sept 13, hour 17, on `dean-branch`, before `docs/06-freeze.md` exists. The freeze prompt (`docs/prompts/dean/checkpoint-3.md`, prompt 3) copies sections 1 and 2 of this file into `docs/06-freeze.md` verbatim and adds the hash. Nothing in section 2 has been run at the time of writing; the point is that it is committed unrun, so "cases chosen after the method was fixed" is checkable, not asserted.

## 1. What the freeze covers, exactly

**The frozen object is the map Observation → Belief** (more precisely, since CP3 prompt 2d: the map from the observation history and the brain's own applied-command history to Belief; on the open-loop family no command is applied, so there it is Observation → Belief exactly). Concretely: `src/brain/index.ts`, `src/brain/consistency.ts`, `src/brain/hypotheses.ts`, `src/brain/physics.ts`, and everything in `src/corruption/`. After the freeze commit these files do not change; `src/eval/freeze.test.ts` diffs them against the recorded hash and fails the suite if they do.

**What is deliberately not frozen, and why that is not a loophole:**

- **The baselines** (`src/brain/kalman.ts`). Making the opponent stronger after the freeze can only hurt us. We added innovation gating and posterior probabilities at hour 17, before the freeze, so the comparison in the freeze record already includes them.
- **The evaluation harness** (`src/eval/`). Metrics, sweeps, probes, and case families are how the frozen estimator is measured; changing how we measure is disclosed in `decisions.md`, and every number in the writeup names the metric definition it used.
- **The allocator** (`src/brain/commands.ts`, the hook file, plus `src/brain/allocator.ts` at checkpoint 4). The hook exists before the freeze: `index.ts` already calls `planCommands({ plan, belief, kept, drones, prev })` on every tick and today it returns no commands, so the checkpoint-4 allocator changes `commands.ts` and adds `allocator.ts` only; no frozen file changes and no second hash is recorded. This is the part a judge should look at hardest, so here it is in our own words: **the allocator changes which observations arrive.** Once drones are dispatched by the brain, the closed-loop trajectory (which sensors are where, which spaces get suppressed, which drones die) is different from a run with idle drones. So the freeze does NOT cover the closed-loop trajectory. It covers the estimator: given any observation stream, the belief it produces is the frozen function. Every estimator number in the writeup is therefore reported on the **open-loop family**: fixed sensors plus idle drones, exactly the streams in section 2. The allocator is evaluated separately, on its own metrics (containment, drone-ticks spent hedging, time to resolve an ambiguity), against the frozen estimator's beliefs. We do not claim estimator numbers on closed-loop runs.
- **The UI, docs, plans as data.** New structure files are new inputs, not new method.

## 2. Held-out evaluation families, chosen now, run after the freeze

Case-selection seed: **20260913**. Evaluation seeds below are disjoint from every seed used during development (development used seeds 1–10 and 42).

| Family | What varies | Fixed | Why it is here |
|---|---|---|---|
| **H1 named target** | plans demo-6, vessel-3x8, tower-5x4 × modes freeze, blind, saturate, flashover, mixed × targets ignition, neighbor, far | k=1, onset 5, 120 ticks, **seeds 101–120** | The main table, on fresh seeds. |
| **H2 random target** | same plans and modes, target chosen by the corruptor, **k ∈ {1, 2, 3}** | onset 5, 120 ticks, seeds 101–120 | Where our temperature error lives (140–166 °C at hour 17); we expect that to hold and say so. |
| **H3 model mismatch** | brain's edge rates × U(1−s, 1+s), **s ∈ {0.1, 0.3, 0.5}**, mismatch seed 7 | modes freeze, blind, flashover; plans demo-6, vessel-3x8; seeds 101–105 | The brief asks what happens outside our assumptions. "Physics as a trusted reference" is true by construction until this runs. |
| **H4 onset** | corruption onset ∈ {1, 5, 15, 30} | mode freeze and flashover, target ignition, demo-6 and vessel-3x8, seeds 101–105 | A sensor that dies before the fire is visible is a different problem from one that dies after. |
| **H5 correlated named failures** | two named targets at once: ignition + hottest neighbor, k=2, modes freeze and blind | all three plans, onset 5, seeds 101–110 | Correlated failure beyond flashover; the brief asks about correlation explicitly. |
| **H6 unseen structures** | grid plans from `npm run gen:plans` with generator seeds 201–205 if the generator accepts a seed, else the two shipped generated plans | mode flashover and mixed, random target, seeds 101–105 | Buildings the estimator has never been run on. |

Command lines, to be pasted into `docs/06-freeze.md` when they run:

```
npm run sweep -- --plans demo-6,vessel-3x8,tower-5x4 --targets ignition,neighbor,far --k 1 --seeds 101..120 --ticks 120
npm run sweep -- --plans demo-6,vessel-3x8,tower-5x4 --targets random --k 1,2,3 --seeds 101..120 --ticks 120
npm run probe:mismatch -- --scale 0.1 --seed 7 ; npm run probe:mismatch -- --scale 0.3 --seed 7 ; npm run probe:mismatch -- --scale 0.5 --seed 7
```
H4, H5, and H6 need small additions to the sweep's flags (`--onset`, a two-space target, a generated plan); those are eval-code changes and are allowed.

## 3. Pre-registered expectations

Stated now so that the post-freeze result can be compared against a prediction, not a story:

1. Ours reports 0 % false certainty at P ≥ 0.9 on H1, H2, H4, H5. Any nonzero cell is reported as a finding, not tuned away.
2. The gated Kalman does not close the gap on false certainty in any mode (hour-17 evidence: 62–69 % vs 64–72 % naive), because the baseline's false certainty is the hot-vs-burning gap, present on a clean run, which no gate addresses; we expect this to hold on fresh seeds and on the bigger plans. Gating also makes the baseline a worse thermometer on clean runs; we expect that to hold too.
3. Under H3: at s = 0.3 (one seed, run at hour 18) ours was unchanged to 0.1 C. At s = 0.5 we expect coverage to drop and temperature error to rise, with false certainty staying near zero because the consistency rules widen with the misfit. If false certainty rises instead, that is the headline limitation.
4. H2 temperature error stays above 100 °C for ours on every plan. The burning set stays honest; the thermometer does not.
