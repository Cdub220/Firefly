# 06 · The method freeze

Frozen Sunday Sept 13, hour 36 (Mon Sept 14, 12:00 AM ET). Sections 1 and 2 are copied verbatim from `docs/06-freeze-plan.md`, which was written before the freeze on purpose; the rest is the record.

## 1. What the freeze covers, exactly

**The frozen object is the map Observation → Belief** (more precisely, since CP3 prompt 2d: the map from the observation history and the brain's own applied-command history to Belief; on the open-loop family no command is applied, so there it is Observation → Belief exactly). Concretely: `src/brain/index.ts`, `src/brain/consistency.ts`, `src/brain/hypotheses.ts`, `src/brain/physics.ts`, and everything in `src/corruption/`. After the freeze commit these files do not change; `src/eval/freeze.test.ts` diffs them against the recorded hash and fails the suite if they do.

**What is deliberately not frozen, and why that is not a loophole:**

- **The baselines** (`src/brain/kalman.ts`). Making the opponent stronger after the freeze can only hurt us. We added innovation gating and posterior probabilities at hour 17, before the freeze, so the comparison in the freeze record already includes them.
- **The evaluation harness** (`src/eval/`). Metrics, sweeps, probes, and case families are how the frozen estimator is measured; changing how we measure is disclosed in `decisions.md`, and every number in the writeup names the metric definition it used.
- **The allocator** (`src/brain/commands.ts`, the hook file, plus `src/brain/allocator.ts` at checkpoint 4). The hook exists before the freeze: `index.ts` already calls `planCommands({ plan, belief, kept, drones, prev })` on every tick and today it returns no commands, so the checkpoint-4 allocator changes `commands.ts` and adds `allocator.ts` only; no frozen file changes and no second hash is recorded. This is the part a judge should look at hardest, so here it is in our own words: **the allocator changes which observations arrive.** Once drones are dispatched by the brain, the closed-loop trajectory (which sensors are where, which spaces get suppressed, which drones die) is different from a run with idle drones. So the freeze does NOT cover the closed-loop trajectory. It covers the estimator: given any observation stream, the belief it produces is the frozen function. Every estimator number in the writeup is therefore reported on the **open-loop family**: fixed sensors plus idle drones, exactly the streams in section 2. The allocator is evaluated separately, on its own metrics (containment, drone-ticks spent hedging, time to resolve an ambiguity), against the frozen estimator's beliefs. We do not claim estimator numbers on closed-loop runs.
- **The UI, docs, plans as data.** New structure files are new inputs, not new method.

**Added at the freeze, on the scope:** on closed-loop runs the frozen object's inputs are the observation history plus the brain's own applied-command history, because the suppression rollout (CP3 prompt 2d) counts tethers the brain itself sent; on the open-loop family no command is applied, so there the frozen object is Observation → Belief exactly.

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

## 3. The freeze record

**Post-freeze note on the baselines (Mon hour 47).** The Kalman baselines' transition matrices lacked the structure's per-space outgoing-rate clamp (`MAX_OUTGOING_RATE = 0.9`), which the world and the brain's `physics.ts` both apply; on the 108-space incident plan (`docs/10-incident-replay.md`) the filter therefore diverged. Fixed in `src/brain/kalman.ts` (`addTransfer`), the sweep re-run, `results/sweep-latest.json` and `src/ui/sweepSummary.json` regenerated. Ours' 1,800 rows are bit-identical to the freeze-time sweep (the estimator did not change); the baselines' plan means move by at most 3 points on tower-5x4 and vessel-3x8 (whose mid-column shaft spaces exceed 0.9) and not at all on demo-6 (max 0.55); the WHERE OURS LOSES block is unchanged. The table below is the freeze-time table; the freeze-time JSON is `git show 457de46:results/sweep-latest.json`. This is the baseline modelling the same structure the brain models, permitted by §1 and disclosed here and in `docs/decisions.md`.

**Freeze commit:** `457de46847453854b93bdbaa807c0a17a2e844d4` (dean-branch; HEAD after the full sweep below was committed). `src/eval/freeze.test.ts` reads this hash and fails the suite if `src/brain/index.ts`, `consistency.ts`, `hypotheses.ts`, `physics.ts` or anything under `src/corruption/` differs from it.

### The failure model as frozen

```ts
export type CorruptionMode = 'none' | 'freeze' | 'blind' | 'saturate' | 'flashover' | 'mixed';

/**
 * The failure model's knobs. Every field here is rendered by Chase's chaos panel, so the
 * type stays flat and every field except `seed` and `mode` is optional (defaults exported
 * as DEFAULT_CORRUPTION from src/corruption).
 */
export type CorruptionConfig = {
  seed: number;
  mode: CorruptionMode;
  k?: number; // max number of sensors corrupted at once (freeze/blind budget). default 2.
  onset?: number; // first tick failures may begin. default 5.
  target?: SpaceId[]; // restrict corruption to sensors in these spaces. omit = any.
  flashoverTemp?: number; // temp above which a space's sensors all die. default 500.
  saturateAt?: number; // temp at which a sensor pins. default 300.
  ambient?: number; // what a blinded sensor reads (set to plan.ambient). default 20.
};
```

Modes: `none`, `freeze` (up to k sensors keep reporting their last value with a stale timestamp), `blind` (up to k sensors read ambient), `saturate` (every sensor whose true temperature exceeds `saturateAt` pins at exactly that value; no k limit), `flashover` (every sensor in a space above `flashoverTemp` dies and stops reporting), `mixed` (freeze + blind sharing the k budget, plus saturate, flashover and a 2 %-per-tick drone comms loss). All modes respect `onset`. Drone self-reports may go stale or be dropped; the world never lies (`docs/04-who-does-what.md`).

### The estimator as frozen

One paragraph, for the judge who asks what exactly was frozen. Each tick the brain sees an `Observation` (readings from fixed sensors and drone-borne sensors, and drone self-reports) and nothing else. **Consistency rules** (`consistency.ts`), applied in order, remove readings from the trusted pool: stale (timestamp lags by more than 2 ticks); frozen (flat for 6 ticks while the median trusted neighbour moved more than 15 C, with the window restarting whenever a drone-borne sensor changes space); impossible rise and impossible drop (beyond what the heat physics allows from the previous estimate, with unsensed neighbours estimated above 60 C allowed anywhere between ambient and flame temperature, a moving drone's first reading in a space exempt, and a fixed sensor that changes space judged against its own last reading); cold in a hot neighbourhood (below ambient + 10 C while every trusted neighbour on any edge is above 250 C and at least one of them is across a door or passage; the brain has no door state); and no heat path (above 200 C, previously estimated below 60 C, with nothing trusted above 60 C within two edges, after a 3-tick grace that also applies to impossible rise but not to impossible drop). **Hypothesis enumeration** (`hypotheses.ts`) builds candidate burning sets (at most 64) around the previous best set and every seed space (a trusted reading above 200 C, a previous estimate above 200 C, or the warmest reading 30 C above ambient: each seed alone, with each neighbour, and each neighbour alone), forcing in any space whose trusted reading has been above ignition for 3 consecutive ticks while its assumed fuel budget lasts. Each candidate is **scored** by rolling the linear heat model (`physics.ts`: per-edge transfer at the plan's rates, generation as a pull toward 900 C at 0.25 per tick, 1.5× in a fuel-hazard space, 0.02 ambient loss, and from CP3 prompt 2d suppression by tethers the brain itself sent) forward three ticks from the estimate of three ticks ago and taking the mean absolute residual against the trusted readings **after dropping the k largest downward residuals** (k = 1 by default: up to k sensors may still be lying undetected, and every corruption mode pushes readings down). Every hypothesis within max(8 C, 15 %) of the best is kept; `burningSet` is their intersection (the best set if the intersection is empty), the rest of their union is reported as `ambiguous` in connected components, and P(burning) per space is the weighted fraction of kept hypotheses containing it (weights exp(−(score − best)/tolerance)), times 0.8 per distrusted sensor in the space, capped at 0.9 until the space has been in every survivor for 2 ticks. **Confidence** = 1/kept × 0.8 per suspect sensor × min(1, 6 C / best score), capped at 0.7 until the burning set has been uncontested, unchanged and well fitting for 5 consecutive ticks, floored at 0.05, and forced to 0.05 with no trusted reading at all (in which case the last belief is carried forward, advanced one tick by physics). The estimate is the trusted readings where present and the best hypothesis's one-step physics elsewhere.

### The sweep as frozen

`npm run sweep -- --plans demo-6,vessel-3x8,tower-5x4`: 3 plans × 5 modes × k ∈ {1, 2, 3} × 4 targets × 10 seeds × 120 ticks, four brains on identical observation streams, open loop. 7200 rows in `results/sweep-latest.json`. It took 367.5 s on the development laptop, over the prompt's 5-minute budget, because the prompt was written for two brains and the table has four; the seeds were not reduced.

```
plan         mode       k   target    brain          falseCert  fc@P.9  coverage  wrongDisp   err C              ttr  ms/tick
demo-6       freeze     1   ignition  ours                  0%      1%       98%         8%     4.0     29.0 (10/10)     0.14
demo-6       freeze     1   ignition  kalman               83%     82%      100%        83%    31.5     11.6 (10/10)     0.04
demo-6       freeze     1   ignition  kalman-gated         72%     84%      100%        84%    91.5     11.6 (10/10)     0.04
demo-6       freeze     1   ignition  kalman-source        66%     48%       86%        51%    26.0     29.0 (10/10)     0.06

demo-6       freeze     1   neighbor  ours                  0%      1%       95%         7%     2.6     66.6 (10/10)     0.11
demo-6       freeze     1   neighbor  kalman               83%     82%      100%        83%    64.6     11.6 (10/10)     0.04
demo-6       freeze     1   neighbor  kalman-gated         71%     83%      100%        84%   100.5     11.6 (10/10)     0.03
demo-6       freeze     1   neighbor  kalman-source        97%     77%       57%        78%    66.1     never (0/10)     0.05

demo-6       freeze     1   far       ours                  0%      3%       98%        10%     1.8     67.9 (10/10)     0.10
demo-6       freeze     1   far       kalman               96%     81%       57%        81%    95.1       8.0 (1/10)     0.03
demo-6       freeze     1   far       kalman-gated         70%     82%       89%        82%   117.9     never (0/10)     0.03
demo-6       freeze     1   far       kalman-source        93%     53%       55%        55%    90.9     never (0/10)     0.05

demo-6       freeze     1   random    ours                  0%      2%       97%         9%     1.1     36.2 (10/10)     0.23
demo-6       freeze     1   random    kalman               86%     82%       91%        83%    38.8      11.8 (8/10)     0.06
demo-6       freeze     1   random    kalman-gated         75%     84%       97%        84%    92.0      11.8 (8/10)     0.05
demo-6       freeze     1   random    kalman-source        56%     36%       77%        39%    34.1      13.8 (5/10)     0.09

demo-6       freeze     2   ignition  ours                  0%      1%       98%         8%     4.0     29.0 (10/10)     0.36
demo-6       freeze     2   ignition  kalman               83%     82%      100%        83%    31.5     11.6 (10/10)     0.14
demo-6       freeze     2   ignition  kalman-gated         72%     84%      100%        84%    91.5     11.6 (10/10)     0.07
demo-6       freeze     2   ignition  kalman-source        66%     48%       86%        51%    26.0     29.0 (10/10)     0.15

demo-6       freeze     2   neighbor  ours                  0%      1%       95%         7%     2.6     66.6 (10/10)     0.23
demo-6       freeze     2   neighbor  kalman               83%     82%      100%        83%    64.6     11.6 (10/10)     0.09
demo-6       freeze     2   neighbor  kalman-gated         71%     83%      100%        84%   100.5     11.6 (10/10)     0.04
demo-6       freeze     2   neighbor  kalman-source        97%     77%       57%        78%    66.1     never (0/10)     0.09

demo-6       freeze     2   far       ours                  0%      3%       98%        10%     1.8     67.9 (10/10)     0.18
demo-6       freeze     2   far       kalman               96%     81%       57%        81%    95.1       8.0 (1/10)     0.04
demo-6       freeze     2   far       kalman-gated         70%     82%       89%        82%   117.9     never (0/10)     0.04
demo-6       freeze     2   far       kalman-source        93%     53%       55%        55%    90.9     never (0/10)     0.08

demo-6       freeze     2   random    ours                  0%      2%       97%         9%     1.6     35.5 (10/10)     0.08
demo-6       freeze     2   random    kalman               88%     82%       87%        83%    57.1      11.7 (7/10)     0.03
demo-6       freeze     2   random    kalman-gated         76%     83%       94%        83%    99.5      11.7 (7/10)     0.02
demo-6       freeze     2   random    kalman-source        64%     42%       72%        46%    53.1      14.5 (4/10)     0.05

demo-6       freeze     3   ignition  ours                  0%      1%       98%         8%     4.0     29.0 (10/10)     0.09
demo-6       freeze     3   ignition  kalman               83%     82%      100%        83%    31.5     11.6 (10/10)     0.03
demo-6       freeze     3   ignition  kalman-gated         72%     84%      100%        84%    91.5     11.6 (10/10)     0.03
demo-6       freeze     3   ignition  kalman-source        66%     48%       86%        51%    26.0     29.0 (10/10)     0.05

demo-6       freeze     3   neighbor  ours                  0%      1%       95%         7%     2.6     66.6 (10/10)     0.08
demo-6       freeze     3   neighbor  kalman               83%     82%      100%        83%    64.6     11.6 (10/10)     0.03
demo-6       freeze     3   neighbor  kalman-gated         71%     83%      100%        84%   100.5     11.6 (10/10)     0.02
demo-6       freeze     3   neighbor  kalman-source        97%     77%       57%        78%    66.1     never (0/10)     0.04

demo-6       freeze     3   far       ours                  0%      3%       98%        10%     1.8     67.9 (10/10)     0.08
demo-6       freeze     3   far       kalman               96%     81%       57%        81%    95.1       8.0 (1/10)     0.03
demo-6       freeze     3   far       kalman-gated         70%     82%       89%        82%   117.9     never (0/10)     0.02
demo-6       freeze     3   far       kalman-source        93%     53%       55%        55%    90.9     never (0/10)     0.04

demo-6       freeze     3   random    ours                  0%      2%       96%         9%     3.0     60.5 (10/10)     0.09
demo-6       freeze     3   random    kalman               92%     81%       74%        82%   106.6      11.0 (5/10)     0.03
demo-6       freeze     3   random    kalman-gated         73%     82%       90%        82%   123.6      11.8 (4/10)     0.02
demo-6       freeze     3   random    kalman-source        95%     67%       56%        69%   106.0     never (0/10)     0.05

demo-6       blind      1   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.08
demo-6       blind      1   ignition  kalman               79%     62%       75%        62%   103.5     29.0 (10/10)     0.03
demo-6       blind      1   ignition  kalman-gated         78%     78%       91%        79%   110.7     never (0/10)     0.02
demo-6       blind      1   ignition  kalman-source        79%     60%       75%        60%   100.4     29.0 (10/10)     0.04

demo-6       blind      1   neighbor  ours                  0%      2%       94%         8%     2.5     66.6 (10/10)     0.08
demo-6       blind      1   neighbor  kalman               97%     80%       57%        81%    99.0     never (0/10)     0.03
demo-6       blind      1   neighbor  kalman-gated         66%     82%       87%        83%   113.7     never (0/10)     0.02
demo-6       blind      1   neighbor  kalman-source        98%     81%       57%        81%    98.7     never (0/10)     0.04

demo-6       blind      1   far       ours                  0%      3%       98%        10%     1.7     67.9 (10/10)     0.08
demo-6       blind      1   far       kalman               96%     81%       57%        81%    98.3       8.0 (1/10)     0.03
demo-6       blind      1   far       kalman-gated         63%     82%       89%        83%   121.6     never (0/10)     0.02
demo-6       blind      1   far       kalman-source        94%     53%       55%        56%    94.3     never (0/10)     0.05

demo-6       blind      1   random    ours                  0%      2%       97%         9%     1.0     36.2 (10/10)     0.10
demo-6       blind      1   random    kalman               89%     82%       83%        82%    47.5      11.8 (6/10)     0.03
demo-6       blind      1   random    kalman-gated         70%     83%       95%        84%    95.6      11.8 (6/10)     0.03
demo-6       blind      1   random    kalman-source        56%     37%       77%        40%    42.5      13.8 (5/10)     0.05

demo-6       blind      2   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.09
demo-6       blind      2   ignition  kalman               79%     62%       75%        62%   103.5     29.0 (10/10)     0.03
demo-6       blind      2   ignition  kalman-gated         78%     78%       91%        79%   110.7     never (0/10)     0.03
demo-6       blind      2   ignition  kalman-source        79%     60%       75%        60%   100.4     29.0 (10/10)     0.05

demo-6       blind      2   neighbor  ours                  0%      2%       94%         8%     2.5     66.6 (10/10)     0.11
demo-6       blind      2   neighbor  kalman               97%     80%       57%        81%    99.0     never (0/10)     0.04
demo-6       blind      2   neighbor  kalman-gated         66%     82%       87%        83%   113.7     never (0/10)     0.03
demo-6       blind      2   neighbor  kalman-source        98%     81%       57%        81%    98.7     never (0/10)     0.05

demo-6       blind      2   far       ours                  0%      3%       98%        10%     1.7     67.9 (10/10)     0.15
demo-6       blind      2   far       kalman               96%     81%       57%        81%    98.3       8.0 (1/10)     0.06
demo-6       blind      2   far       kalman-gated         63%     82%       89%        83%   121.6     never (0/10)     0.04
demo-6       blind      2   far       kalman-source        94%     53%       55%        56%    94.3     never (0/10)     0.07

demo-6       blind      2   random    ours                  0%      2%       97%         9%     1.8     35.5 (10/10)     0.11
demo-6       blind      2   random    kalman               89%     82%       82%        82%    69.2      11.8 (6/10)     0.04
demo-6       blind      2   random    kalman-gated         74%     83%       92%        83%   105.6      11.8 (6/10)     0.03
demo-6       blind      2   random    kalman-source        65%     44%       72%        48%    64.9      14.5 (4/10)     0.05

demo-6       blind      3   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.16
demo-6       blind      3   ignition  kalman               79%     62%       75%        62%   103.5     29.0 (10/10)     0.07
demo-6       blind      3   ignition  kalman-gated         78%     78%       91%        79%   110.7     never (0/10)     0.04
demo-6       blind      3   ignition  kalman-source        79%     60%       75%        60%   100.4     29.0 (10/10)     0.07

demo-6       blind      3   neighbor  ours                  0%      2%       94%         8%     2.5     66.6 (10/10)     0.13
demo-6       blind      3   neighbor  kalman               97%     80%       57%        81%    99.0     never (0/10)     0.05
demo-6       blind      3   neighbor  kalman-gated         66%     82%       87%        83%   113.7     never (0/10)     0.03
demo-6       blind      3   neighbor  kalman-source        98%     81%       57%        81%    98.7     never (0/10)     0.06

demo-6       blind      3   far       ours                  0%      3%       98%        10%     1.7     67.9 (10/10)     0.10
demo-6       blind      3   far       kalman               96%     81%       57%        81%    98.3       8.0 (1/10)     0.04
demo-6       blind      3   far       kalman-gated         63%     82%       89%        83%   121.6     never (0/10)     0.03
demo-6       blind      3   far       kalman-source        94%     53%       55%        56%    94.3     never (0/10)     0.05

demo-6       blind      3   random    ours                  0%      2%       96%         9%     3.3     60.5 (10/10)     0.10
demo-6       blind      3   random    kalman               96%     78%       60%        78%   136.8      25.0 (3/10)     0.03
demo-6       blind      3   random    kalman-gated         75%     80%       81%        81%   142.1      14.0 (1/10)     0.03
demo-6       blind      3   random    kalman-source        96%     68%       55%        69%   135.5      53.0 (1/10)     0.05

demo-6       saturate   1   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.11
demo-6       saturate   1   ignition  kalman               82%     82%      100%        82%    54.2     11.6 (10/10)     0.03
demo-6       saturate   1   ignition  kalman-gated         80%     84%      100%        84%    92.2     11.6 (10/10)     0.03
demo-6       saturate   1   ignition  kalman-source        66%     44%       79%        48%    54.2     29.0 (10/10)     0.05

demo-6       saturate   1   neighbor  ours                  0%      2%       97%         7%     4.5     61.0 (10/10)     0.14
demo-6       saturate   1   neighbor  kalman               83%     82%      100%        83%    53.4     11.6 (10/10)     0.04
demo-6       saturate   1   neighbor  kalman-gated         72%     83%      100%        84%    97.0     11.6 (10/10)     0.03
demo-6       saturate   1   neighbor  kalman-source        88%     64%       57%        67%    52.9    104.6 (10/10)     0.06

demo-6       saturate   1   far       ours                  0%      3%       98%        10%     4.2     12.6 (10/10)     0.10
demo-6       saturate   1   far       kalman               83%     82%      100%        83%    53.7     11.6 (10/10)     0.03
demo-6       saturate   1   far       kalman-gated         70%     84%      100%        84%    99.1     11.6 (10/10)     0.03
demo-6       saturate   1   far       kalman-source        82%     41%       55%        45%    51.0    104.8 (10/10)     0.05

demo-6       saturate   1   random    ours                  0%      7%       88%        49%   304.5     19.6 (10/10)     0.09
demo-6       saturate   1   random    kalman               82%     82%      100%        82%   294.1     11.6 (10/10)     0.03
demo-6       saturate   1   random    kalman-gated         82%     83%      100%        83%   208.5     11.6 (10/10)     0.02
demo-6       saturate   1   random    kalman-source        51%      5%       55%         7%   310.0     61.6 (10/10)     0.05

demo-6       saturate   2   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.09
demo-6       saturate   2   ignition  kalman               82%     82%      100%        82%    54.2     11.6 (10/10)     0.03
demo-6       saturate   2   ignition  kalman-gated         80%     84%      100%        84%    92.2     11.6 (10/10)     0.03
demo-6       saturate   2   ignition  kalman-source        66%     44%       79%        48%    54.2     29.0 (10/10)     0.04

demo-6       saturate   2   neighbor  ours                  0%      2%       97%         7%     4.5     61.0 (10/10)     0.08
demo-6       saturate   2   neighbor  kalman               83%     82%      100%        83%    53.4     11.6 (10/10)     0.03
demo-6       saturate   2   neighbor  kalman-gated         72%     83%      100%        84%    97.0     11.6 (10/10)     0.02
demo-6       saturate   2   neighbor  kalman-source        88%     64%       57%        67%    52.9    104.6 (10/10)     0.04

demo-6       saturate   2   far       ours                  0%      3%       98%        10%     4.2     12.6 (10/10)     0.08
demo-6       saturate   2   far       kalman               83%     82%      100%        83%    53.7     11.6 (10/10)     0.03
demo-6       saturate   2   far       kalman-gated         70%     84%      100%        84%    99.1     11.6 (10/10)     0.03
demo-6       saturate   2   far       kalman-source        82%     41%       55%        45%    51.0    104.8 (10/10)     0.05

demo-6       saturate   2   random    ours                  0%      7%       88%        49%   304.5     19.6 (10/10)     0.09
demo-6       saturate   2   random    kalman               82%     82%      100%        82%   294.1     11.6 (10/10)     0.03
demo-6       saturate   2   random    kalman-gated         82%     83%      100%        83%   208.5     11.6 (10/10)     0.03
demo-6       saturate   2   random    kalman-source        51%      5%       55%         7%   310.0     61.6 (10/10)     0.05

demo-6       saturate   3   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.09
demo-6       saturate   3   ignition  kalman               82%     82%      100%        82%    54.2     11.6 (10/10)     0.03
demo-6       saturate   3   ignition  kalman-gated         80%     84%      100%        84%    92.2     11.6 (10/10)     0.03
demo-6       saturate   3   ignition  kalman-source        66%     44%       79%        48%    54.2     29.0 (10/10)     0.05

demo-6       saturate   3   neighbor  ours                  0%      2%       97%         7%     4.5     61.0 (10/10)     0.09
demo-6       saturate   3   neighbor  kalman               83%     82%      100%        83%    53.4     11.6 (10/10)     0.03
demo-6       saturate   3   neighbor  kalman-gated         72%     83%      100%        84%    97.0     11.6 (10/10)     0.03
demo-6       saturate   3   neighbor  kalman-source        88%     64%       57%        67%    52.9    104.6 (10/10)     0.05

demo-6       saturate   3   far       ours                  0%      3%       98%        10%     4.2     12.6 (10/10)     0.08
demo-6       saturate   3   far       kalman               83%     82%      100%        83%    53.7     11.6 (10/10)     0.03
demo-6       saturate   3   far       kalman-gated         70%     84%      100%        84%    99.1     11.6 (10/10)     0.02
demo-6       saturate   3   far       kalman-source        82%     41%       55%        45%    51.0    104.8 (10/10)     0.04

demo-6       saturate   3   random    ours                  0%      7%       88%        49%   304.5     19.6 (10/10)     0.09
demo-6       saturate   3   random    kalman               82%     82%      100%        82%   294.1     11.6 (10/10)     0.03
demo-6       saturate   3   random    kalman-gated         82%     83%      100%        83%   208.5     11.6 (10/10)     0.02
demo-6       saturate   3   random    kalman-source        51%      5%       55%         7%   310.0     61.6 (10/10)     0.04

demo-6       flashover  1   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.08
demo-6       flashover  1   ignition  kalman               83%     82%      100%        83%    31.9     11.6 (10/10)     0.03
demo-6       flashover  1   ignition  kalman-gated         61%     84%      100%        84%    95.8     11.6 (10/10)     0.03
demo-6       flashover  1   ignition  kalman-source         1%     75%       59%        75%    77.7     never (0/10)     0.04

demo-6       flashover  1   neighbor  ours                  0%      1%       96%         7%     1.9     66.6 (10/10)     0.09
demo-6       flashover  1   neighbor  kalman               83%     82%      100%        83%    18.0     11.6 (10/10)     0.03
demo-6       flashover  1   neighbor  kalman-gated         61%     84%      100%        84%    90.2     11.6 (10/10)     0.03
demo-6       flashover  1   neighbor  kalman-source        19%     23%       66%         9%     9.8     12.9 (10/10)     0.04

demo-6       flashover  1   far       ours                  0%      3%       98%        10%     1.4     67.9 (10/10)     0.09
demo-6       flashover  1   far       kalman               83%     82%      100%        83%    20.1     11.6 (10/10)     0.03
demo-6       flashover  1   far       kalman-gated         63%     84%      100%        84%    91.0     11.6 (10/10)     0.03
demo-6       flashover  1   far       kalman-source        13%     49%       55%        33%    23.0      87.9 (9/10)     0.05

demo-6       flashover  1   random    ours                  0%     49%       54%        49%   184.6      58.0 (1/10)     0.02
demo-6       flashover  1   random    kalman                8%     82%      100%        83%   184.5     11.6 (10/10)     0.01
demo-6       flashover  1   random    kalman-gated          6%     84%      100%        84%   189.9     11.6 (10/10)     0.01
demo-6       flashover  1   random    kalman-source         1%     75%       56%        75%  1398.4      12.0 (1/10)     0.01

demo-6       flashover  2   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.08
demo-6       flashover  2   ignition  kalman               83%     82%      100%        83%    31.9     11.6 (10/10)     0.03
demo-6       flashover  2   ignition  kalman-gated         61%     84%      100%        84%    95.8     11.6 (10/10)     0.03
demo-6       flashover  2   ignition  kalman-source         1%     75%       59%        75%    77.7     never (0/10)     0.04

demo-6       flashover  2   neighbor  ours                  0%      1%       96%         7%     1.9     66.6 (10/10)     0.08
demo-6       flashover  2   neighbor  kalman               83%     82%      100%        83%    18.0     11.6 (10/10)     0.03
demo-6       flashover  2   neighbor  kalman-gated         61%     84%      100%        84%    90.2     11.6 (10/10)     0.02
demo-6       flashover  2   neighbor  kalman-source        19%     23%       66%         9%     9.8     12.9 (10/10)     0.04

demo-6       flashover  2   far       ours                  0%      3%       98%        10%     1.4     67.9 (10/10)     0.08
demo-6       flashover  2   far       kalman               83%     82%      100%        83%    20.1     11.6 (10/10)     0.03
demo-6       flashover  2   far       kalman-gated         63%     84%      100%        84%    91.0     11.6 (10/10)     0.02
demo-6       flashover  2   far       kalman-source        13%     49%       55%        33%    23.0      87.9 (9/10)     0.04

demo-6       flashover  2   random    ours                  0%     49%       54%        49%   184.6      58.0 (1/10)     0.01
demo-6       flashover  2   random    kalman                8%     82%      100%        83%   184.5     11.6 (10/10)     0.01
demo-6       flashover  2   random    kalman-gated          6%     84%      100%        84%   189.9     11.6 (10/10)     0.01
demo-6       flashover  2   random    kalman-source         1%     75%       56%        75%  1398.4      12.0 (1/10)     0.01

demo-6       flashover  3   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.07
demo-6       flashover  3   ignition  kalman               83%     82%      100%        83%    31.9     11.6 (10/10)     0.03
demo-6       flashover  3   ignition  kalman-gated         61%     84%      100%        84%    95.8     11.6 (10/10)     0.02
demo-6       flashover  3   ignition  kalman-source         1%     75%       59%        75%    77.7     never (0/10)     0.04

demo-6       flashover  3   neighbor  ours                  0%      1%       96%         7%     1.9     66.6 (10/10)     0.08
demo-6       flashover  3   neighbor  kalman               83%     82%      100%        83%    18.0     11.6 (10/10)     0.03
demo-6       flashover  3   neighbor  kalman-gated         61%     84%      100%        84%    90.2     11.6 (10/10)     0.02
demo-6       flashover  3   neighbor  kalman-source        19%     23%       66%         9%     9.8     12.9 (10/10)     0.04

demo-6       flashover  3   far       ours                  0%      3%       98%        10%     1.4     67.9 (10/10)     0.08
demo-6       flashover  3   far       kalman               83%     82%      100%        83%    20.1     11.6 (10/10)     0.03
demo-6       flashover  3   far       kalman-gated         63%     84%      100%        84%    91.0     11.6 (10/10)     0.02
demo-6       flashover  3   far       kalman-source        13%     49%       55%        33%    23.0      87.9 (9/10)     0.04

demo-6       flashover  3   random    ours                  0%     49%       54%        49%   184.6      58.0 (1/10)     0.01
demo-6       flashover  3   random    kalman                8%     82%      100%        83%   184.5     11.6 (10/10)     0.01
demo-6       flashover  3   random    kalman-gated          6%     84%      100%        84%   189.9     11.6 (10/10)     0.01
demo-6       flashover  3   random    kalman-source         1%     75%       56%        75%  1398.4      12.0 (1/10)     0.01

demo-6       mixed      1   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.08
demo-6       mixed      1   ignition  kalman               83%     82%      100%        83%    31.9     11.6 (10/10)     0.03
demo-6       mixed      1   ignition  kalman-gated         66%     84%      100%        84%    92.4     11.6 (10/10)     0.02
demo-6       mixed      1   ignition  kalman-source         1%     75%       59%        75%    77.7     never (0/10)     0.04

demo-6       mixed      1   neighbor  ours                  0%      2%       95%         7%     2.5     66.7 (10/10)     0.08
demo-6       mixed      1   neighbor  kalman               82%     81%       98%        82%    20.2     11.6 (10/10)     0.03
demo-6       mixed      1   neighbor  kalman-gated         67%     83%       99%        84%    87.0     11.6 (10/10)     0.03
demo-6       mixed      1   neighbor  kalman-source        33%     78%       57%        78%    41.7      53.0 (1/10)     0.04

demo-6       mixed      1   far       ours                  0%      3%       98%        10%     1.8     67.9 (10/10)     0.09
demo-6       mixed      1   far       kalman               83%     81%       98%        81%    23.1     12.9 (10/10)     0.03
demo-6       mixed      1   far       kalman-gated         66%     82%      100%        83%    87.3     11.0 (10/10)     0.03
demo-6       mixed      1   far       kalman-source        14%     53%       55%        56%    72.7     never (0/10)     0.04

demo-6       mixed      1   random    ours                  0%     44%       54%        49%   209.4      58.0 (1/10)     0.02
demo-6       mixed      1   random    kalman                8%     82%       99%        82%   187.9     11.6 (10/10)     0.01
demo-6       mixed      1   random    kalman-gated          7%     83%       99%        84%   190.0     11.6 (10/10)     0.01
demo-6       mixed      1   random    kalman-source         3%     77%       50%        78%   501.7     never (0/10)     0.01

demo-6       mixed      2   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.11
demo-6       mixed      2   ignition  kalman               83%     82%      100%        83%    31.9     11.6 (10/10)     0.03
demo-6       mixed      2   ignition  kalman-gated         66%     84%      100%        84%    92.4     11.6 (10/10)     0.03
demo-6       mixed      2   ignition  kalman-source         1%     75%       59%        75%    77.7     never (0/10)     0.05

demo-6       mixed      2   neighbor  ours                  0%      2%       95%         7%     2.5     66.7 (10/10)     0.08
demo-6       mixed      2   neighbor  kalman               82%     81%       98%        82%    20.2     11.6 (10/10)     0.03
demo-6       mixed      2   neighbor  kalman-gated         67%     83%       99%        84%    87.0     11.6 (10/10)     0.03
demo-6       mixed      2   neighbor  kalman-source        33%     78%       57%        78%    41.7      53.0 (1/10)     0.05

demo-6       mixed      2   far       ours                  0%      3%       98%        10%     1.8     67.9 (10/10)     0.16
demo-6       mixed      2   far       kalman               83%     81%       98%        81%    23.1     12.9 (10/10)     0.04
demo-6       mixed      2   far       kalman-gated         66%     82%      100%        83%    87.3     11.0 (10/10)     0.04
demo-6       mixed      2   far       kalman-source        14%     53%       55%        56%    72.7     never (0/10)     0.07

demo-6       mixed      2   random    ours                  0%     39%       54%        50%   209.6      58.0 (1/10)     0.03
demo-6       mixed      2   random    kalman                7%     81%       98%        82%   190.0     11.6 (10/10)     0.02
demo-6       mixed      2   random    kalman-gated          7%     83%       99%        83%   190.2     11.5 (10/10)     0.01
demo-6       mixed      2   random    kalman-source         3%     79%       50%        80%   453.8     never (0/10)     0.02

demo-6       mixed      3   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.10
demo-6       mixed      3   ignition  kalman               83%     82%      100%        83%    31.9     11.6 (10/10)     0.03
demo-6       mixed      3   ignition  kalman-gated         66%     84%      100%        84%    92.4     11.6 (10/10)     0.03
demo-6       mixed      3   ignition  kalman-source         1%     75%       59%        75%    77.7     never (0/10)     0.05

demo-6       mixed      3   neighbor  ours                  0%      2%       95%         7%     2.5     66.7 (10/10)     0.10
demo-6       mixed      3   neighbor  kalman               82%     81%       98%        82%    20.2     11.6 (10/10)     0.03
demo-6       mixed      3   neighbor  kalman-gated         67%     83%       99%        84%    87.0     11.6 (10/10)     0.03
demo-6       mixed      3   neighbor  kalman-source        33%     78%       57%        78%    41.7      53.0 (1/10)     0.05

demo-6       mixed      3   far       ours                  0%      3%       98%        10%     1.8     67.9 (10/10)     0.08
demo-6       mixed      3   far       kalman               83%     81%       98%        81%    23.1     12.9 (10/10)     0.03
demo-6       mixed      3   far       kalman-gated         66%     82%      100%        83%    87.3     11.0 (10/10)     0.02
demo-6       mixed      3   far       kalman-source        14%     53%       55%        56%    72.7     never (0/10)     0.04

demo-6       mixed      3   random    ours                  0%     44%       58%        50%   207.0      58.0 (1/10)     0.02
demo-6       mixed      3   random    kalman                8%     81%       97%        81%   191.9     11.9 (10/10)     0.01
demo-6       mixed      3   random    kalman-gated          7%     82%       98%        83%   190.8     11.5 (10/10)     0.01
demo-6       mixed      3   random    kalman-source         3%     79%       50%        80%   438.6     never (0/10)     0.02

tower-5x4    freeze     1   ignition  ours                  0%      6%       96%         7%     3.9      0.0 (10/10)     1.78
tower-5x4    freeze     1   ignition  kalman               88%     88%      100%        88%    21.3     22.0 (10/10)     0.29
tower-5x4    freeze     1   ignition  kalman-gated         84%     94%      100%        94%    61.6      36.0 (5/10)     0.24
tower-5x4    freeze     1   ignition  kalman-source         0%     43%       43%        42%    12.8      0.0 (10/10)     0.79

tower-5x4    freeze     1   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     1.66
tower-5x4    freeze     1   neighbor  kalman               90%     87%       90%        87%    32.9     20.4 (10/10)     0.32
tower-5x4    freeze     1   neighbor  kalman-gated         82%     92%      100%        92%    64.4      36.0 (5/10)     0.24
tower-5x4    freeze     1   neighbor  kalman-source         0%     73%       37%        70%    25.4      0.0 (10/10)     0.86

tower-5x4    freeze     1   far       ours                  0%      6%       97%         7%     2.6      0.0 (10/10)     1.21
tower-5x4    freeze     1   far       kalman               91%     84%       57%        86%    43.4       8.0 (5/10)     0.25
tower-5x4    freeze     1   far       kalman-gated         80%     93%       89%        94%    79.9     never (0/10)     0.19
tower-5x4    freeze     1   far       kalman-source         0%     47%       46%        52%    70.7      0.0 (10/10)     0.72

tower-5x4    freeze     1   random    ours                  0%      6%       96%         7%     2.6      0.0 (10/10)     1.08
tower-5x4    freeze     1   random    kalman               91%     87%       68%        87%    34.0      14.9 (7/10)     0.23
tower-5x4    freeze     1   random    kalman-gated         84%     93%       92%        94%    71.2      36.0 (2/10)     0.18
tower-5x4    freeze     1   random    kalman-source         0%     59%       43%        57%    29.4      0.0 (10/10)     0.65

tower-5x4    freeze     2   ignition  ours                  0%      6%       96%         7%     3.9      0.0 (10/10)     0.87
tower-5x4    freeze     2   ignition  kalman               88%     88%      100%        88%    21.3     22.0 (10/10)     0.21
tower-5x4    freeze     2   ignition  kalman-gated         84%     94%      100%        94%    61.6      36.0 (5/10)     0.18
tower-5x4    freeze     2   ignition  kalman-source         0%     43%       43%        42%    12.8      0.0 (10/10)     0.60

tower-5x4    freeze     2   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     0.88
tower-5x4    freeze     2   neighbor  kalman               90%     87%       90%        87%    32.9     20.4 (10/10)     0.22
tower-5x4    freeze     2   neighbor  kalman-gated         82%     92%      100%        92%    64.4      36.0 (5/10)     0.17
tower-5x4    freeze     2   neighbor  kalman-source         0%     73%       37%        70%    25.4      0.0 (10/10)     0.61

tower-5x4    freeze     2   far       ours                  0%      6%       97%         7%     2.6      0.0 (10/10)     0.86
tower-5x4    freeze     2   far       kalman               91%     84%       57%        86%    43.4       8.0 (5/10)     0.21
tower-5x4    freeze     2   far       kalman-gated         80%     93%       89%        94%    79.9     never (0/10)     0.16
tower-5x4    freeze     2   far       kalman-source         0%     47%       46%        52%    70.7      0.0 (10/10)     0.61

tower-5x4    freeze     2   random    ours                  0%      6%       96%         7%     3.4      0.0 (10/10)     0.97
tower-5x4    freeze     2   random    kalman               93%     87%       53%        87%    49.0       6.4 (5/10)     0.21
tower-5x4    freeze     2   random    kalman-gated         82%     93%       85%        93%    78.5     never (0/10)     0.16
tower-5x4    freeze     2   random    kalman-source         0%     66%       42%        63%    45.0      0.0 (10/10)     0.60

tower-5x4    freeze     3   ignition  ours                  0%      6%       96%         7%     3.9      0.0 (10/10)     0.87
tower-5x4    freeze     3   ignition  kalman               88%     88%      100%        88%    21.3     22.0 (10/10)     0.22
tower-5x4    freeze     3   ignition  kalman-gated         84%     94%      100%        94%    61.6      36.0 (5/10)     0.18
tower-5x4    freeze     3   ignition  kalman-source         0%     43%       43%        42%    12.8      0.0 (10/10)     0.61

tower-5x4    freeze     3   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     1.18
tower-5x4    freeze     3   neighbor  kalman               90%     87%       90%        87%    32.9     20.4 (10/10)     0.29
tower-5x4    freeze     3   neighbor  kalman-gated         82%     92%      100%        92%    64.4      36.0 (5/10)     0.21
tower-5x4    freeze     3   neighbor  kalman-source         0%     73%       37%        70%    25.4      0.0 (10/10)     0.77

tower-5x4    freeze     3   far       ours                  0%      6%       97%         7%     2.6      0.0 (10/10)     1.05
tower-5x4    freeze     3   far       kalman               91%     84%       57%        86%    43.4       8.0 (5/10)     0.25
tower-5x4    freeze     3   far       kalman-gated         80%     93%       89%        94%    79.9     never (0/10)     0.20
tower-5x4    freeze     3   far       kalman-source         0%     47%       46%        52%    70.7      0.0 (10/10)     0.70

tower-5x4    freeze     3   random    ours                  0%      7%       96%         7%     3.7      0.0 (10/10)     1.67
tower-5x4    freeze     3   random    kalman               94%     86%       49%        86%    64.8       6.0 (4/10)     0.34
tower-5x4    freeze     3   random    kalman-gated         82%     93%       81%        93%    87.0     never (0/10)     0.29
tower-5x4    freeze     3   random    kalman-source         0%     68%       40%        67%    68.3      0.0 (10/10)     1.01

tower-5x4    blind      1   ignition  ours                  0%      6%       96%         7%     4.0      0.0 (10/10)     0.96
tower-5x4    blind      1   ignition  kalman               88%     75%       61%        76%    43.5     45.4 (10/10)     0.23
tower-5x4    blind      1   ignition  kalman-gated         85%     86%       85%        86%    69.3     never (0/10)     0.19
tower-5x4    blind      1   ignition  kalman-source         0%     79%       25%        73%    35.8     never (0/10)     0.64

tower-5x4    blind      1   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     0.97
tower-5x4    blind      1   neighbor  kalman               95%     87%       57%        87%    41.6       4.8 (5/10)     0.23
tower-5x4    blind      1   neighbor  kalman-gated         86%     89%       86%        89%    67.1       0.0 (2/10)     0.18
tower-5x4    blind      1   neighbor  kalman-source         0%     86%       37%        81%    33.5     never (0/10)     0.65

tower-5x4    blind      1   far       ours                  0%      6%       95%         8%     5.3      0.0 (10/10)     0.97
tower-5x4    blind      1   far       kalman               91%     84%       57%        86%    43.4       8.0 (5/10)     0.24
tower-5x4    blind      1   far       kalman-gated         81%     93%       89%        94%    79.9     never (0/10)     0.18
tower-5x4    blind      1   far       kalman-source         0%     47%       46%        52%    70.8      0.0 (10/10)     0.66

tower-5x4    blind      1   random    ours                  0%      6%       96%         7%     3.1      0.0 (10/10)     0.95
tower-5x4    blind      1   random    kalman               92%     86%       62%        86%    38.0      16.1 (7/10)     0.23
tower-5x4    blind      1   random    kalman-gated         84%     92%       89%        92%    71.1       0.0 (1/10)     0.18
tower-5x4    blind      1   random    kalman-source         0%     65%       42%        63%    33.7       0.0 (8/10)     0.65

tower-5x4    blind      2   ignition  ours                  0%      6%       96%         7%     4.0      0.0 (10/10)     0.99
tower-5x4    blind      2   ignition  kalman               88%     75%       61%        76%    43.5     45.4 (10/10)     0.23
tower-5x4    blind      2   ignition  kalman-gated         85%     86%       85%        86%    69.3     never (0/10)     0.18
tower-5x4    blind      2   ignition  kalman-source         0%     79%       25%        73%    35.8     never (0/10)     0.66

tower-5x4    blind      2   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     1.07
tower-5x4    blind      2   neighbor  kalman               95%     87%       57%        87%    41.6       4.8 (5/10)     0.26
tower-5x4    blind      2   neighbor  kalman-gated         86%     89%       86%        89%    67.1       0.0 (2/10)     0.19
tower-5x4    blind      2   neighbor  kalman-source         0%     86%       37%        81%    33.5     never (0/10)     0.71

tower-5x4    blind      2   far       ours                  0%      6%       95%         8%     5.3      0.0 (10/10)     0.89
tower-5x4    blind      2   far       kalman               91%     84%       57%        86%    43.4       8.0 (5/10)     0.22
tower-5x4    blind      2   far       kalman-gated         81%     93%       89%        94%    79.9     never (0/10)     0.17
tower-5x4    blind      2   far       kalman-source         0%     47%       46%        52%    70.8      0.0 (10/10)     0.62

tower-5x4    blind      2   random    ours                  0%      6%       95%         8%     4.2      0.0 (10/10)     0.96
tower-5x4    blind      2   random    kalman               94%     85%       50%        85%    53.5       6.4 (5/10)     0.22
tower-5x4    blind      2   random    kalman-gated         83%     91%       83%        91%    78.4       0.0 (1/10)     0.17
tower-5x4    blind      2   random    kalman-source         0%     71%       41%        68%    49.8       0.0 (8/10)     0.64

tower-5x4    blind      3   ignition  ours                  0%      6%       96%         7%     4.0      0.0 (10/10)     0.92
tower-5x4    blind      3   ignition  kalman               88%     75%       61%        76%    43.5     45.4 (10/10)     0.23
tower-5x4    blind      3   ignition  kalman-gated         85%     86%       85%        86%    69.3     never (0/10)     0.18
tower-5x4    blind      3   ignition  kalman-source         0%     79%       25%        73%    35.8     never (0/10)     0.63

tower-5x4    blind      3   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     0.97
tower-5x4    blind      3   neighbor  kalman               95%     87%       57%        87%    41.6       4.8 (5/10)     0.23
tower-5x4    blind      3   neighbor  kalman-gated         86%     89%       86%        89%    67.1       0.0 (2/10)     0.18
tower-5x4    blind      3   neighbor  kalman-source         0%     86%       37%        81%    33.5     never (0/10)     0.64

tower-5x4    blind      3   far       ours                  0%      6%       95%         8%     5.3      0.0 (10/10)     0.85
tower-5x4    blind      3   far       kalman               91%     84%       57%        86%    43.4       8.0 (5/10)     0.21
tower-5x4    blind      3   far       kalman-gated         81%     93%       89%        94%    79.9     never (0/10)     0.16
tower-5x4    blind      3   far       kalman-source         0%     47%       46%        52%    70.8      0.0 (10/10)     0.60

tower-5x4    blind      3   random    ours                  0%      9%       91%         9%    10.8      0.0 (10/10)     0.95
tower-5x4    blind      3   random    kalman               94%     84%       46%        85%    70.5       6.0 (4/10)     0.21
tower-5x4    blind      3   random    kalman-gated         79%     91%       76%        91%    92.5       0.0 (1/10)     0.15
tower-5x4    blind      3   random    kalman-source         0%     73%       39%        72%    74.0       0.0 (7/10)     0.61

tower-5x4    saturate   1   ignition  ours                  0%      6%       96%         7%     4.4      0.0 (10/10)     0.84
tower-5x4    saturate   1   ignition  kalman               88%     87%      100%        88%    29.0     22.0 (10/10)     0.21
tower-5x4    saturate   1   ignition  kalman-gated         81%     92%      100%        92%    60.1      31.3 (6/10)     0.17
tower-5x4    saturate   1   ignition  kalman-source         0%     59%       37%        68%    21.4       8.0 (2/10)     0.59

tower-5x4    saturate   1   neighbor  ours                  0%      6%       96%         7%     3.3      0.0 (10/10)     0.86
tower-5x4    saturate   1   neighbor  kalman               88%     88%      100%        88%    27.9     22.0 (10/10)     0.22
tower-5x4    saturate   1   neighbor  kalman-gated         83%     94%      100%        94%    64.0      36.0 (5/10)     0.17
tower-5x4    saturate   1   neighbor  kalman-source         0%     69%       38%        67%    20.0      0.0 (10/10)     0.61

tower-5x4    saturate   1   far       ours                  0%      6%       95%         7%     3.5      0.0 (10/10)     0.85
tower-5x4    saturate   1   far       kalman               88%     88%      100%        88%    29.8     22.0 (10/10)     0.21
tower-5x4    saturate   1   far       kalman-gated         80%     94%      100%        94%    77.1      36.0 (5/10)     0.16
tower-5x4    saturate   1   far       kalman-source         0%     44%       46%        44%    43.2      0.0 (10/10)     0.60

tower-5x4    saturate   1   random    ours                  0%     15%       87%        41%   300.9      0.0 (10/10)     0.98
tower-5x4    saturate   1   random    kalman               91%     83%       53%        84%   317.8       8.0 (5/10)     0.22
tower-5x4    saturate   1   random    kalman-gated         71%     90%      100%        90%   171.1      28.0 (7/10)     0.15
tower-5x4    saturate   1   random    kalman-source         0%     17%       45%        23%   306.4     90.7 (10/10)     0.62

tower-5x4    saturate   2   ignition  ours                  0%      6%       96%         7%     4.4      0.0 (10/10)     0.88
tower-5x4    saturate   2   ignition  kalman               88%     87%      100%        88%    29.0     22.0 (10/10)     0.21
tower-5x4    saturate   2   ignition  kalman-gated         81%     92%      100%        92%    60.1      31.3 (6/10)     0.18
tower-5x4    saturate   2   ignition  kalman-source         0%     59%       37%        68%    21.4       8.0 (2/10)     0.61

tower-5x4    saturate   2   neighbor  ours                  0%      6%       96%         7%     3.3      0.0 (10/10)     0.88
tower-5x4    saturate   2   neighbor  kalman               88%     88%      100%        88%    27.9     22.0 (10/10)     0.22
tower-5x4    saturate   2   neighbor  kalman-gated         83%     94%      100%        94%    64.0      36.0 (5/10)     0.17
tower-5x4    saturate   2   neighbor  kalman-source         0%     69%       38%        67%    20.0      0.0 (10/10)     0.61

tower-5x4    saturate   2   far       ours                  0%      6%       95%         7%     3.5      0.0 (10/10)     0.87
tower-5x4    saturate   2   far       kalman               88%     88%      100%        88%    29.8     22.0 (10/10)     0.21
tower-5x4    saturate   2   far       kalman-gated         80%     94%      100%        94%    77.1      36.0 (5/10)     0.16
tower-5x4    saturate   2   far       kalman-source         0%     44%       46%        44%    43.2      0.0 (10/10)     0.60

tower-5x4    saturate   2   random    ours                  0%     15%       87%        41%   300.9      0.0 (10/10)     0.76
tower-5x4    saturate   2   random    kalman               91%     83%       53%        84%   317.8       8.0 (5/10)     0.21
tower-5x4    saturate   2   random    kalman-gated         71%     90%      100%        90%   171.1      28.0 (7/10)     0.14
tower-5x4    saturate   2   random    kalman-source         0%     17%       45%        23%   306.4     90.7 (10/10)     0.60

tower-5x4    saturate   3   ignition  ours                  0%      6%       96%         7%     4.4      0.0 (10/10)     0.87
tower-5x4    saturate   3   ignition  kalman               88%     87%      100%        88%    29.0     22.0 (10/10)     0.21
tower-5x4    saturate   3   ignition  kalman-gated         81%     92%      100%        92%    60.1      31.3 (6/10)     0.18
tower-5x4    saturate   3   ignition  kalman-source         0%     59%       37%        68%    21.4       8.0 (2/10)     0.61

tower-5x4    saturate   3   neighbor  ours                  0%      6%       96%         7%     3.3      0.0 (10/10)     0.91
tower-5x4    saturate   3   neighbor  kalman               88%     88%      100%        88%    27.9     22.0 (10/10)     0.22
tower-5x4    saturate   3   neighbor  kalman-gated         83%     94%      100%        94%    64.0      36.0 (5/10)     0.17
tower-5x4    saturate   3   neighbor  kalman-source         0%     69%       38%        67%    20.0      0.0 (10/10)     0.62

tower-5x4    saturate   3   far       ours                  0%      6%       95%         7%     3.5      0.0 (10/10)     1.39
tower-5x4    saturate   3   far       kalman               88%     88%      100%        88%    29.8     22.0 (10/10)     0.31
tower-5x4    saturate   3   far       kalman-gated         80%     94%      100%        94%    77.1      36.0 (5/10)     0.24
tower-5x4    saturate   3   far       kalman-source         0%     44%       46%        44%    43.2      0.0 (10/10)     0.86

tower-5x4    saturate   3   random    ours                  0%     15%       87%        41%   300.9      0.0 (10/10)     1.55
tower-5x4    saturate   3   random    kalman               91%     83%       53%        84%   317.8       8.0 (5/10)     0.36
tower-5x4    saturate   3   random    kalman-gated         71%     90%      100%        90%   171.1      28.0 (7/10)     0.25
tower-5x4    saturate   3   random    kalman-source         0%     17%       45%        23%   306.4     90.7 (10/10)     0.99

tower-5x4    flashover  1   ignition  ours                  0%      6%       96%         7%     3.9      0.0 (10/10)     1.30
tower-5x4    flashover  1   ignition  kalman               88%     88%      100%        88%    16.6     22.0 (10/10)     0.28
tower-5x4    flashover  1   ignition  kalman-gated         84%     93%      100%        94%    61.8      36.0 (5/10)     0.26
tower-5x4    flashover  1   ignition  kalman-source         0%     65%       45%        61%    17.5      0.0 (10/10)     0.83

tower-5x4    flashover  1   neighbor  ours                  0%      6%       96%         7%     2.8      0.0 (10/10)     1.14
tower-5x4    flashover  1   neighbor  kalman               88%     88%      100%        88%    15.3     22.0 (10/10)     0.25
tower-5x4    flashover  1   neighbor  kalman-gated         82%     94%      100%        94%    63.8      36.0 (5/10)     0.21
tower-5x4    flashover  1   neighbor  kalman-source         0%     31%       45%        26%     7.5      0.0 (10/10)     0.72

tower-5x4    flashover  1   far       ours                  0%      6%       96%         7%     2.6      0.0 (10/10)     0.87
tower-5x4    flashover  1   far       kalman               88%     88%      100%        88%    15.2     22.0 (10/10)     0.21
tower-5x4    flashover  1   far       kalman-gated         86%     94%      100%        94%    61.6      36.0 (5/10)     0.18
tower-5x4    flashover  1   far       kalman-source         0%     16%       44%        16%     5.3      0.0 (10/10)     0.61

tower-5x4    flashover  1   random    ours                  0%     24%       46%        26%   243.0      0.0 (10/10)     0.27
tower-5x4    flashover  1   random    kalman               20%     88%      100%        88%    88.1     22.0 (10/10)     0.09
tower-5x4    flashover  1   random    kalman-gated         18%     93%      100%        94%   140.9      36.0 (5/10)     0.08
tower-5x4    flashover  1   random    kalman-source         0%     61%       41%        61%   831.3      0.0 (10/10)     0.37

tower-5x4    flashover  2   ignition  ours                  0%      6%       96%         7%     3.9      0.0 (10/10)     0.86
tower-5x4    flashover  2   ignition  kalman               88%     88%      100%        88%    16.6     22.0 (10/10)     0.20
tower-5x4    flashover  2   ignition  kalman-gated         84%     93%      100%        94%    61.8      36.0 (5/10)     0.17
tower-5x4    flashover  2   ignition  kalman-source         0%     65%       45%        61%    17.5      0.0 (10/10)     0.58

tower-5x4    flashover  2   neighbor  ours                  0%      6%       96%         7%     2.8      0.0 (10/10)     0.87
tower-5x4    flashover  2   neighbor  kalman               88%     88%      100%        88%    15.3     22.0 (10/10)     0.20
tower-5x4    flashover  2   neighbor  kalman-gated         82%     94%      100%        94%    63.8      36.0 (5/10)     0.17
tower-5x4    flashover  2   neighbor  kalman-source         0%     31%       45%        26%     7.5      0.0 (10/10)     0.59

tower-5x4    flashover  2   far       ours                  0%      6%       96%         7%     2.6      0.0 (10/10)     0.88
tower-5x4    flashover  2   far       kalman               88%     88%      100%        88%    15.2     22.0 (10/10)     0.21
tower-5x4    flashover  2   far       kalman-gated         86%     94%      100%        94%    61.6      36.0 (5/10)     0.18
tower-5x4    flashover  2   far       kalman-source         0%     16%       44%        16%     5.3      0.0 (10/10)     0.61

tower-5x4    flashover  2   random    ours                  0%     24%       46%        26%   243.0      0.0 (10/10)     0.25
tower-5x4    flashover  2   random    kalman               20%     88%      100%        88%    88.1     22.0 (10/10)     0.09
tower-5x4    flashover  2   random    kalman-gated         18%     93%      100%        94%   140.9      36.0 (5/10)     0.09
tower-5x4    flashover  2   random    kalman-source         0%     61%       41%        61%   831.3      0.0 (10/10)     0.37

tower-5x4    flashover  3   ignition  ours                  0%      6%       96%         7%     3.9      0.0 (10/10)     0.88
tower-5x4    flashover  3   ignition  kalman               88%     88%      100%        88%    16.6     22.0 (10/10)     0.20
tower-5x4    flashover  3   ignition  kalman-gated         84%     93%      100%        94%    61.8      36.0 (5/10)     0.18
tower-5x4    flashover  3   ignition  kalman-source         0%     65%       45%        61%    17.5      0.0 (10/10)     0.60

tower-5x4    flashover  3   neighbor  ours                  0%      6%       96%         7%     2.8      0.0 (10/10)     0.86
tower-5x4    flashover  3   neighbor  kalman               88%     88%      100%        88%    15.3     22.0 (10/10)     0.20
tower-5x4    flashover  3   neighbor  kalman-gated         82%     94%      100%        94%    63.8      36.0 (5/10)     0.18
tower-5x4    flashover  3   neighbor  kalman-source         0%     31%       45%        26%     7.5      0.0 (10/10)     0.55

tower-5x4    flashover  3   far       ours                  0%      6%       96%         7%     2.6      0.0 (10/10)     0.87
tower-5x4    flashover  3   far       kalman               88%     88%      100%        88%    15.2     22.0 (10/10)     0.21
tower-5x4    flashover  3   far       kalman-gated         86%     94%      100%        94%    61.6      36.0 (5/10)     0.18
tower-5x4    flashover  3   far       kalman-source         0%     16%       44%        16%     5.3      0.0 (10/10)     0.49

tower-5x4    flashover  3   random    ours                  0%     24%       46%        26%   243.0      0.0 (10/10)     0.26
tower-5x4    flashover  3   random    kalman               20%     88%      100%        88%    88.1     22.0 (10/10)     0.09
tower-5x4    flashover  3   random    kalman-gated         18%     93%      100%        94%   140.9      36.0 (5/10)     0.09
tower-5x4    flashover  3   random    kalman-source         0%     61%       41%        61%   831.3      0.0 (10/10)     0.26

tower-5x4    mixed      1   ignition  ours                  0%      6%       96%         7%     4.0      0.0 (10/10)     0.85
tower-5x4    mixed      1   ignition  kalman               90%     87%       95%        88%    17.7     22.2 (10/10)     0.20
tower-5x4    mixed      1   ignition  kalman-gated         85%     92%       99%        93%    59.6      36.0 (5/10)     0.17
tower-5x4    mixed      1   ignition  kalman-source         0%     62%       36%        60%    14.5       5.2 (5/10)     0.47

tower-5x4    mixed      1   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     0.85
tower-5x4    mixed      1   neighbor  kalman               89%     87%       97%        87%    16.6     20.4 (10/10)     0.20
tower-5x4    mixed      1   neighbor  kalman-gated         82%     91%       98%        91%    58.7      30.0 (6/10)     0.18
tower-5x4    mixed      1   neighbor  kalman-source         0%     78%       37%        75%    19.7       0.0 (4/10)     0.48

tower-5x4    mixed      1   far       ours                  0%      6%       96%         7%     3.7      0.0 (10/10)     0.86
tower-5x4    mixed      1   far       kalman               86%     84%       98%        86%    16.6     22.0 (10/10)     0.22
tower-5x4    mixed      1   far       kalman-gated         87%     93%      100%        94%    57.4      36.0 (5/10)     0.18
tower-5x4    mixed      1   far       kalman-source         0%     47%       46%        52%    35.0      0.0 (10/10)     0.50

tower-5x4    mixed      1   random    ours                  0%      3%       49%        31%   278.2      0.0 (10/10)     0.26
tower-5x4    mixed      1   random    kalman               20%     85%       98%        86%    93.2     22.1 (10/10)     0.09
tower-5x4    mixed      1   random    kalman-gated         18%     92%       99%        93%   139.6      31.3 (6/10)     0.08
tower-5x4    mixed      1   random    kalman-source         0%     79%       38%        81%   211.5       0.0 (1/10)     0.26

tower-5x4    mixed      2   ignition  ours                  0%      6%       96%         7%     4.0      0.0 (10/10)     0.88
tower-5x4    mixed      2   ignition  kalman               90%     87%       95%        88%    17.7     22.2 (10/10)     0.20
tower-5x4    mixed      2   ignition  kalman-gated         85%     92%       99%        93%    59.6      36.0 (5/10)     0.18
tower-5x4    mixed      2   ignition  kalman-source         0%     62%       36%        60%    14.5       5.2 (5/10)     0.49

tower-5x4    mixed      2   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     0.90
tower-5x4    mixed      2   neighbor  kalman               89%     87%       97%        87%    16.6     20.4 (10/10)     0.21
tower-5x4    mixed      2   neighbor  kalman-gated         82%     91%       98%        91%    58.7      30.0 (6/10)     0.18
tower-5x4    mixed      2   neighbor  kalman-source         0%     78%       37%        75%    19.7       0.0 (4/10)     0.49

tower-5x4    mixed      2   far       ours                  0%      6%       96%         7%     3.7      0.0 (10/10)     0.89
tower-5x4    mixed      2   far       kalman               86%     84%       98%        86%    16.6     22.0 (10/10)     0.21
tower-5x4    mixed      2   far       kalman-gated         87%     93%      100%        94%    57.4      36.0 (5/10)     0.18
tower-5x4    mixed      2   far       kalman-source         0%     47%       46%        52%    35.0      0.0 (10/10)     0.50

tower-5x4    mixed      2   random    ours                  0%      3%       49%        33%   277.9      0.0 (10/10)     0.27
tower-5x4    mixed      2   random    kalman               20%     84%       96%        86%    94.8     22.1 (10/10)     0.11
tower-5x4    mixed      2   random    kalman-gated         18%     92%       98%        93%   139.7      31.3 (6/10)     0.09
tower-5x4    mixed      2   random    kalman-source         0%     83%       36%        85%   212.1       0.0 (1/10)     0.28

tower-5x4    mixed      3   ignition  ours                  0%      6%       96%         7%     4.0      0.0 (10/10)     0.98
tower-5x4    mixed      3   ignition  kalman               90%     87%       95%        88%    17.7     22.2 (10/10)     0.21
tower-5x4    mixed      3   ignition  kalman-gated         85%     92%       99%        93%    59.6      36.0 (5/10)     0.19
tower-5x4    mixed      3   ignition  kalman-source         0%     62%       36%        60%    14.5       5.2 (5/10)     0.51

tower-5x4    mixed      3   neighbor  ours                  0%      6%       95%         7%     3.3      0.0 (10/10)     0.98
tower-5x4    mixed      3   neighbor  kalman               89%     87%       97%        87%    16.6     20.4 (10/10)     0.23
tower-5x4    mixed      3   neighbor  kalman-gated         82%     91%       98%        91%    58.7      30.0 (6/10)     0.20
tower-5x4    mixed      3   neighbor  kalman-source         0%     78%       37%        75%    19.7       0.0 (4/10)     0.53

tower-5x4    mixed      3   far       ours                  0%      6%       96%         7%     3.7      0.0 (10/10)     0.89
tower-5x4    mixed      3   far       kalman               86%     84%       98%        86%    16.6     22.0 (10/10)     0.21
tower-5x4    mixed      3   far       kalman-gated         87%     93%      100%        94%    57.4      36.0 (5/10)     0.18
tower-5x4    mixed      3   far       kalman-source         0%     47%       46%        52%    35.0      0.0 (10/10)     0.49

tower-5x4    mixed      3   random    ours                  0%      3%       49%        33%   277.1      0.0 (10/10)     0.25
tower-5x4    mixed      3   random    kalman               20%     83%       95%        85%    95.8     21.3 (10/10)     0.09
tower-5x4    mixed      3   random    kalman-gated         18%     91%       97%        91%   137.5      26.9 (7/10)     0.09
tower-5x4    mixed      3   random    kalman-source         0%     84%       35%        85%   212.2       0.0 (2/10)     0.28

vessel-3x8   freeze     1   ignition  ours                  0%      8%       93%        10%     1.8     83.1 (10/10)     1.70
vessel-3x8   freeze     1   ignition  kalman               97%     97%      100%        97%    16.1     never (0/10)     0.40
vessel-3x8   freeze     1   ignition  kalman-gated         94%     97%      100%        97%    65.5     never (0/10)     0.33
vessel-3x8   freeze     1   ignition  kalman-source        86%     47%       49%        49%    11.7     71.7 (10/10)     0.92

vessel-3x8   freeze     1   neighbor  ours                  0%      8%       94%        10%     1.4     83.4 (10/10)     2.72
vessel-3x8   freeze     1   neighbor  kalman               97%     97%      100%        97%    25.4     never (0/10)     0.67
vessel-3x8   freeze     1   neighbor  kalman-gated         97%     97%      100%        97%    68.8     never (0/10)     0.48
vessel-3x8   freeze     1   neighbor  kalman-source        97%     84%       43%        85%    19.6     never (0/10)     1.39

vessel-3x8   freeze     1   far       ours                  0%      9%       94%         9%     1.1     75.6 (10/10)     1.90
vessel-3x8   freeze     1   far       kalman              100%     97%       57%        97%    30.9     never (0/10)     0.49
vessel-3x8   freeze     1   far       kalman-gated         97%     97%       89%        97%    81.4     never (0/10)     0.35
vessel-3x8   freeze     1   far       kalman-source        92%     61%       45%        66%    25.6       8.0 (1/10)     1.11

vessel-3x8   freeze     1   random    ours                  0%      8%       94%         9%     1.2     75.1 (10/10)     1.46
vessel-3x8   freeze     1   random    kalman               99%     97%       66%        97%    27.4     never (0/10)     0.42
vessel-3x8   freeze     1   random    kalman-gated         97%     97%       91%        97%    73.6     never (0/10)     0.31
vessel-3x8   freeze     1   random    kalman-source        89%     57%       47%        61%    22.3      43.5 (2/10)     0.95

vessel-3x8   freeze     2   ignition  ours                  0%      8%       93%        10%     1.8     83.1 (10/10)     1.16
vessel-3x8   freeze     2   ignition  kalman               97%     97%      100%        97%    16.1     never (0/10)     0.37
vessel-3x8   freeze     2   ignition  kalman-gated         94%     97%      100%        97%    65.5     never (0/10)     0.30
vessel-3x8   freeze     2   ignition  kalman-source        86%     47%       49%        49%    11.7     71.7 (10/10)     0.86

vessel-3x8   freeze     2   neighbor  ours                  0%      8%       94%        10%     1.4     83.4 (10/10)     1.17
vessel-3x8   freeze     2   neighbor  kalman               97%     97%      100%        97%    25.4     never (0/10)     0.37
vessel-3x8   freeze     2   neighbor  kalman-gated         97%     97%      100%        97%    68.8     never (0/10)     0.28
vessel-3x8   freeze     2   neighbor  kalman-source        97%     84%       43%        85%    19.6     never (0/10)     0.85

vessel-3x8   freeze     2   far       ours                  0%      9%       94%         9%     1.1     75.6 (10/10)     1.21
vessel-3x8   freeze     2   far       kalman              100%     97%       57%        97%    30.9     never (0/10)     0.38
vessel-3x8   freeze     2   far       kalman-gated         97%     97%       89%        97%    81.4     never (0/10)     0.27
vessel-3x8   freeze     2   far       kalman-source        92%     61%       45%        66%    25.6       8.0 (1/10)     0.89

vessel-3x8   freeze     2   random    ours                  0%      8%       94%         9%     1.7     82.9 (10/10)     1.42
vessel-3x8   freeze     2   random    kalman              100%     97%       53%        97%    46.9     never (0/10)     0.35
vessel-3x8   freeze     2   random    kalman-gated         95%     97%       83%        97%    82.5     never (0/10)     0.25
vessel-3x8   freeze     2   random    kalman-source        93%     63%       46%        67%    43.9       8.0 (1/10)     0.87

vessel-3x8   freeze     3   ignition  ours                  0%      8%       93%        10%     1.8     83.1 (10/10)     1.17
vessel-3x8   freeze     3   ignition  kalman               97%     97%      100%        97%    16.1     never (0/10)     0.34
vessel-3x8   freeze     3   ignition  kalman-gated         94%     97%      100%        97%    65.5     never (0/10)     0.28
vessel-3x8   freeze     3   ignition  kalman-source        86%     47%       49%        49%    11.7     71.7 (10/10)     0.86

vessel-3x8   freeze     3   neighbor  ours                  0%      8%       94%        10%     1.4     83.4 (10/10)     1.22
vessel-3x8   freeze     3   neighbor  kalman               97%     97%      100%        97%    25.4     never (0/10)     0.35
vessel-3x8   freeze     3   neighbor  kalman-gated         97%     97%      100%        97%    68.8     never (0/10)     0.28
vessel-3x8   freeze     3   neighbor  kalman-source        97%     84%       43%        85%    19.6     never (0/10)     0.87

vessel-3x8   freeze     3   far       ours                  0%      9%       94%         9%     1.1     75.6 (10/10)     1.27
vessel-3x8   freeze     3   far       kalman              100%     97%       57%        97%    30.9     never (0/10)     0.36
vessel-3x8   freeze     3   far       kalman-gated         97%     97%       89%        97%    81.4     never (0/10)     0.27
vessel-3x8   freeze     3   far       kalman-source        92%     61%       45%        66%    25.6       8.0 (1/10)     0.90

vessel-3x8   freeze     3   random    ours                  0%      8%       93%         9%     2.0     82.1 (10/10)     1.35
vessel-3x8   freeze     3   random    kalman              100%     96%       51%        97%    59.5     never (0/10)     0.36
vessel-3x8   freeze     3   random    kalman-gated         96%     97%       78%        97%    88.6     never (0/10)     0.24
vessel-3x8   freeze     3   random    kalman-source        93%     71%       44%        74%    58.6       8.0 (1/10)     0.87

vessel-3x8   blind      1   ignition  ours                  0%      8%       93%        10%     1.9     83.1 (10/10)     1.19
vessel-3x8   blind      1   ignition  kalman               78%     75%       75%        75%    34.9     29.0 (10/10)     0.34
vessel-3x8   blind      1   ignition  kalman-gated         93%     92%       94%        92%    69.0     never (0/10)     0.28
vessel-3x8   blind      1   ignition  kalman-source        99%     70%       42%        71%    37.1     never (0/10)     0.86

vessel-3x8   blind      1   neighbor  ours                  0%      8%       94%        10%     1.4     83.4 (10/10)     1.21
vessel-3x8   blind      1   neighbor  kalman               99%     96%       57%        96%    33.8     never (0/10)     0.35
vessel-3x8   blind      1   neighbor  kalman-gated         98%     96%       89%        97%    71.7     never (0/10)     0.27
vessel-3x8   blind      1   neighbor  kalman-source        98%     87%       43%        88%    27.2     never (0/10)     1.00

vessel-3x8   blind      1   far       ours                  0%      9%       94%         9%     1.8     75.6 (10/10)     1.15
vessel-3x8   blind      1   far       kalman              100%     97%       57%        97%    30.9     never (0/10)     0.34
vessel-3x8   blind      1   far       kalman-gated         97%     97%       89%        97%    81.3     never (0/10)     0.25
vessel-3x8   blind      1   far       kalman-source        93%     61%       45%        66%    25.7       8.0 (1/10)     1.03

vessel-3x8   blind      1   random    ours                  0%      8%       94%         9%     1.6     75.1 (10/10)     1.17
vessel-3x8   blind      1   random    kalman               99%     97%       66%        97%    28.1     never (0/10)     0.34
vessel-3x8   blind      1   random    kalman-gated         94%     97%       90%        97%    74.1     never (0/10)     0.26
vessel-3x8   blind      1   random    kalman-source        89%     58%       47%        62%    23.0      43.5 (2/10)     1.04

vessel-3x8   blind      2   ignition  ours                  0%      8%       93%        10%     1.9     83.1 (10/10)     1.17
vessel-3x8   blind      2   ignition  kalman               78%     75%       75%        75%    34.9     29.0 (10/10)     0.34
vessel-3x8   blind      2   ignition  kalman-gated         93%     92%       94%        92%    69.0     never (0/10)     0.28
vessel-3x8   blind      2   ignition  kalman-source        99%     70%       42%        71%    37.1     never (0/10)     1.06

vessel-3x8   blind      2   neighbor  ours                  0%      8%       94%        10%     1.4     83.4 (10/10)     1.18
vessel-3x8   blind      2   neighbor  kalman               99%     96%       57%        96%    33.8     never (0/10)     0.34
vessel-3x8   blind      2   neighbor  kalman-gated         98%     96%       89%        97%    71.7     never (0/10)     0.27
vessel-3x8   blind      2   neighbor  kalman-source        98%     87%       43%        88%    27.2     never (0/10)     1.04

vessel-3x8   blind      2   far       ours                  0%      9%       94%         9%     1.8     75.6 (10/10)     1.16
vessel-3x8   blind      2   far       kalman              100%     97%       57%        97%    30.9     never (0/10)     0.34
vessel-3x8   blind      2   far       kalman-gated         97%     97%       89%        97%    81.3     never (0/10)     0.25
vessel-3x8   blind      2   far       kalman-source        93%     61%       45%        66%    25.7       8.0 (1/10)     1.03

vessel-3x8   blind      2   random    ours                  0%      8%       93%         9%     2.4     82.9 (10/10)     1.18
vessel-3x8   blind      2   random    kalman              100%     94%       51%        95%    50.6     never (0/10)     0.34
vessel-3x8   blind      2   random    kalman-gated         96%     96%       81%        97%    84.1     never (0/10)     0.25
vessel-3x8   blind      2   random    kalman-source        95%     67%       45%        71%    48.6     never (0/10)     1.03

vessel-3x8   blind      3   ignition  ours                  0%      8%       93%        10%     1.9     83.1 (10/10)     1.16
vessel-3x8   blind      3   ignition  kalman               78%     75%       75%        75%    34.9     29.0 (10/10)     0.34
vessel-3x8   blind      3   ignition  kalman-gated         93%     92%       94%        92%    69.0     never (0/10)     0.27
vessel-3x8   blind      3   ignition  kalman-source        99%     70%       42%        71%    37.1     never (0/10)     1.03

vessel-3x8   blind      3   neighbor  ours                  0%      8%       94%        10%     1.4     83.4 (10/10)     1.25
vessel-3x8   blind      3   neighbor  kalman               99%     96%       57%        96%    33.8     never (0/10)     0.35
vessel-3x8   blind      3   neighbor  kalman-gated         98%     96%       89%        97%    71.7     never (0/10)     0.28
vessel-3x8   blind      3   neighbor  kalman-source        98%     87%       43%        88%    27.2     never (0/10)     1.06

vessel-3x8   blind      3   far       ours                  0%      9%       94%         9%     1.8     75.6 (10/10)     1.15
vessel-3x8   blind      3   far       kalman              100%     97%       57%        97%    30.9     never (0/10)     0.34
vessel-3x8   blind      3   far       kalman-gated         97%     97%       89%        97%    81.3     never (0/10)     0.25
vessel-3x8   blind      3   far       kalman-source        93%     61%       45%        66%    25.7       8.0 (1/10)     1.03

vessel-3x8   blind      3   random    ours                  0%      8%       93%         9%     2.7     82.1 (10/10)     1.21
vessel-3x8   blind      3   random    kalman              100%     94%       47%        94%    65.5     never (0/10)     0.34
vessel-3x8   blind      3   random    kalman-gated         97%     96%       76%        96%    92.7     never (0/10)     0.24
vessel-3x8   blind      3   random    kalman-source        96%     77%       44%        79%    65.8     never (0/10)     1.03

vessel-3x8   saturate   1   ignition  ours                  0%      8%       93%        10%     2.3     83.1 (10/10)     1.27
vessel-3x8   saturate   1   ignition  kalman               97%     97%      100%        97%    22.4     never (0/10)     0.36
vessel-3x8   saturate   1   ignition  kalman-gated         97%     97%      100%        97%    65.8     never (0/10)     0.30
vessel-3x8   saturate   1   ignition  kalman-source        98%     64%       47%        68%    22.0     never (0/10)     1.10

vessel-3x8   saturate   1   neighbor  ours                  0%      8%       93%        10%     1.7     83.4 (10/10)     1.60
vessel-3x8   saturate   1   neighbor  kalman               97%     97%      100%        97%    22.2     never (0/10)     0.42
vessel-3x8   saturate   1   neighbor  kalman-gated         96%     97%      100%        97%    67.4     never (0/10)     0.35
vessel-3x8   saturate   1   neighbor  kalman-source        96%     82%       43%        84%    16.3     never (0/10)     1.23

vessel-3x8   saturate   1   far       ours                  0%      8%       93%         8%     1.7     75.6 (10/10)     1.38
vessel-3x8   saturate   1   far       kalman               97%     97%      100%        97%    21.0     never (0/10)     0.39
vessel-3x8   saturate   1   far       kalman-gated         97%     97%      100%        97%    74.9     never (0/10)     0.29
vessel-3x8   saturate   1   far       kalman-source        91%     53%       45%        56%    15.9       8.0 (1/10)     1.16

vessel-3x8   saturate   1   random    ours                  0%      9%       89%        46%   314.2     never (0/10)     1.46
vessel-3x8   saturate   1   random    kalman               97%     96%       99%        97%   288.3     never (0/10)     0.35
vessel-3x8   saturate   1   random    kalman-gated         92%     96%       98%        96%   184.7     never (0/10)     0.22
vessel-3x8   saturate   1   random    kalman-source        64%     20%       49%        21%   317.2     75.8 (10/10)     0.88

vessel-3x8   saturate   2   ignition  ours                  0%      8%       93%        10%     2.3     83.1 (10/10)     1.17
vessel-3x8   saturate   2   ignition  kalman               97%     97%      100%        97%    22.4     never (0/10)     0.34
vessel-3x8   saturate   2   ignition  kalman-gated         97%     97%      100%        97%    65.8     never (0/10)     0.29
vessel-3x8   saturate   2   ignition  kalman-source        98%     64%       47%        68%    22.0     never (0/10)     0.87

vessel-3x8   saturate   2   neighbor  ours                  0%      8%       93%        10%     1.7     83.4 (10/10)     1.22
vessel-3x8   saturate   2   neighbor  kalman               97%     97%      100%        97%    22.2     never (0/10)     0.35
vessel-3x8   saturate   2   neighbor  kalman-gated         96%     97%      100%        97%    67.4     never (0/10)     0.28
vessel-3x8   saturate   2   neighbor  kalman-source        96%     82%       43%        84%    16.3     never (0/10)     0.88

vessel-3x8   saturate   2   far       ours                  0%      8%       93%         8%     1.7     75.6 (10/10)     1.17
vessel-3x8   saturate   2   far       kalman               97%     97%      100%        97%    21.0     never (0/10)     0.35
vessel-3x8   saturate   2   far       kalman-gated         97%     97%      100%        97%    74.9     never (0/10)     0.26
vessel-3x8   saturate   2   far       kalman-source        91%     53%       45%        56%    15.9       8.0 (1/10)     0.87

vessel-3x8   saturate   2   random    ours                  0%      9%       89%        46%   314.2     never (0/10)     1.13
vessel-3x8   saturate   2   random    kalman               97%     96%       99%        97%   288.3     never (0/10)     0.35
vessel-3x8   saturate   2   random    kalman-gated         92%     96%       98%        96%   184.7     never (0/10)     0.24
vessel-3x8   saturate   2   random    kalman-source        64%     20%       49%        21%   317.2     75.8 (10/10)     0.89

vessel-3x8   saturate   3   ignition  ours                  0%      8%       93%        10%     2.3     83.1 (10/10)     1.25
vessel-3x8   saturate   3   ignition  kalman               97%     97%      100%        97%    22.4     never (0/10)     0.37
vessel-3x8   saturate   3   ignition  kalman-gated         97%     97%      100%        97%    65.8     never (0/10)     0.31
vessel-3x8   saturate   3   ignition  kalman-source        98%     64%       47%        68%    22.0     never (0/10)     0.92

vessel-3x8   saturate   3   neighbor  ours                  0%      8%       93%        10%     1.7     83.4 (10/10)     1.19
vessel-3x8   saturate   3   neighbor  kalman               97%     97%      100%        97%    22.2     never (0/10)     0.34
vessel-3x8   saturate   3   neighbor  kalman-gated         96%     97%      100%        97%    67.4     never (0/10)     0.28
vessel-3x8   saturate   3   neighbor  kalman-source        96%     82%       43%        84%    16.3     never (0/10)     0.86

vessel-3x8   saturate   3   far       ours                  0%      8%       93%         8%     1.7     75.6 (10/10)     1.23
vessel-3x8   saturate   3   far       kalman               97%     97%      100%        97%    21.0     never (0/10)     0.35
vessel-3x8   saturate   3   far       kalman-gated         97%     97%      100%        97%    74.9     never (0/10)     0.27
vessel-3x8   saturate   3   far       kalman-source        91%     53%       45%        56%    15.9       8.0 (1/10)     0.89

vessel-3x8   saturate   3   random    ours                  0%      9%       89%        46%   314.2     never (0/10)     1.14
vessel-3x8   saturate   3   random    kalman               97%     96%       99%        97%   288.3     never (0/10)     0.35
vessel-3x8   saturate   3   random    kalman-gated         92%     96%       98%        96%   184.7     never (0/10)     0.23
vessel-3x8   saturate   3   random    kalman-source        64%     20%       49%        21%   317.2     75.8 (10/10)     0.88

vessel-3x8   flashover  1   ignition  ours                  0%      8%       93%        10%     1.9     83.1 (10/10)     1.16
vessel-3x8   flashover  1   ignition  kalman               97%     97%      100%        97%    13.6     never (0/10)     0.32
vessel-3x8   flashover  1   ignition  kalman-gated         93%     97%      100%        97%    64.7     never (0/10)     0.28
vessel-3x8   flashover  1   ignition  kalman-source        46%     76%       49%        76%    15.1       8.0 (1/10)     0.83

vessel-3x8   flashover  1   neighbor  ours                  0%      8%       94%        10%     1.3     83.4 (10/10)     1.18
vessel-3x8   flashover  1   neighbor  kalman               97%     97%      100%        97%    11.9     never (0/10)     0.32
vessel-3x8   flashover  1   neighbor  kalman-gated         93%     97%      100%        97%    64.6     never (0/10)     0.28
vessel-3x8   flashover  1   neighbor  kalman-source        50%     18%       49%        22%     4.1     72.7 (10/10)     0.84

vessel-3x8   flashover  1   far       ours                  0%      9%       94%         9%     1.1     75.6 (10/10)     1.21
vessel-3x8   flashover  1   far       kalman               97%     97%      100%        97%    11.3     never (0/10)     0.34
vessel-3x8   flashover  1   far       kalman-gated         93%     97%      100%        97%    64.0     never (0/10)     0.29
vessel-3x8   flashover  1   far       kalman-source        62%     29%       45%        27%     5.0     75.0 (10/10)     0.86

vessel-3x8   flashover  1   random    ours                  0%     33%       48%        42%   188.3       9.0 (1/10)     0.41
vessel-3x8   flashover  1   random    kalman               21%     97%      100%        97%   127.2     never (0/10)     0.12
vessel-3x8   flashover  1   random    kalman-gated         18%     97%      100%        97%   133.6     never (0/10)     0.12
vessel-3x8   flashover  1   random    kalman-source         5%     76%       41%        78%   927.8     never (0/10)     0.39

vessel-3x8   flashover  2   ignition  ours                  0%      8%       93%        10%     1.9     83.1 (10/10)     1.22
vessel-3x8   flashover  2   ignition  kalman               97%     97%      100%        97%    13.6     never (0/10)     0.33
vessel-3x8   flashover  2   ignition  kalman-gated         93%     97%      100%        97%    64.7     never (0/10)     0.30
vessel-3x8   flashover  2   ignition  kalman-source        46%     76%       49%        76%    15.1       8.0 (1/10)     0.85

vessel-3x8   flashover  2   neighbor  ours                  0%      8%       94%        10%     1.3     83.4 (10/10)     1.19
vessel-3x8   flashover  2   neighbor  kalman               97%     97%      100%        97%    11.9     never (0/10)     0.32
vessel-3x8   flashover  2   neighbor  kalman-gated         93%     97%      100%        97%    64.6     never (0/10)     0.28
vessel-3x8   flashover  2   neighbor  kalman-source        50%     18%       49%        22%     4.1     72.7 (10/10)     0.94

vessel-3x8   flashover  2   far       ours                  0%      9%       94%         9%     1.1     75.6 (10/10)     1.20
vessel-3x8   flashover  2   far       kalman               97%     97%      100%        97%    11.3     never (0/10)     0.34
vessel-3x8   flashover  2   far       kalman-gated         93%     97%      100%        97%    64.0     never (0/10)     0.29
vessel-3x8   flashover  2   far       kalman-source        62%     29%       45%        27%     5.0     75.0 (10/10)     1.04

vessel-3x8   flashover  2   random    ours                  0%     33%       48%        42%   188.3       9.0 (1/10)     0.26
vessel-3x8   flashover  2   random    kalman               21%     97%      100%        97%   127.2     never (0/10)     0.13
vessel-3x8   flashover  2   random    kalman-gated         18%     97%      100%        97%   133.6     never (0/10)     0.11
vessel-3x8   flashover  2   random    kalman-source         5%     76%       41%        78%   927.8     never (0/10)     0.56

vessel-3x8   flashover  3   ignition  ours                  0%      8%       93%        10%     1.9     83.1 (10/10)     1.21
vessel-3x8   flashover  3   ignition  kalman               97%     97%      100%        97%    13.6     never (0/10)     0.33
vessel-3x8   flashover  3   ignition  kalman-gated         93%     97%      100%        97%    64.7     never (0/10)     0.29
vessel-3x8   flashover  3   ignition  kalman-source        46%     76%       49%        76%    15.1       8.0 (1/10)     1.04

vessel-3x8   flashover  3   neighbor  ours                  0%      8%       94%        10%     1.3     83.4 (10/10)     1.25
vessel-3x8   flashover  3   neighbor  kalman               97%     97%      100%        97%    11.9     never (0/10)     0.34
vessel-3x8   flashover  3   neighbor  kalman-gated         93%     97%      100%        97%    64.6     never (0/10)     0.29
vessel-3x8   flashover  3   neighbor  kalman-source        50%     18%       49%        22%     4.1     72.7 (10/10)     1.03

vessel-3x8   flashover  3   far       ours                  0%      9%       94%         9%     1.1     75.6 (10/10)     1.31
vessel-3x8   flashover  3   far       kalman               97%     97%      100%        97%    11.3     never (0/10)     0.36
vessel-3x8   flashover  3   far       kalman-gated         93%     97%      100%        97%    64.0     never (0/10)     0.31
vessel-3x8   flashover  3   far       kalman-source        62%     29%       45%        27%     5.0     75.0 (10/10)     1.11

vessel-3x8   flashover  3   random    ours                  0%     33%       48%        42%   188.3       9.0 (1/10)     0.25
vessel-3x8   flashover  3   random    kalman               21%     97%      100%        97%   127.2     never (0/10)     0.12
vessel-3x8   flashover  3   random    kalman-gated         18%     97%      100%        97%   133.6     never (0/10)     0.11
vessel-3x8   flashover  3   random    kalman-source         5%     76%       41%        78%   927.8     never (0/10)     0.57

vessel-3x8   mixed      1   ignition  ours                  0%      8%       93%        10%     1.9     83.0 (10/10)     1.19
vessel-3x8   mixed      1   ignition  kalman               97%     97%      100%        97%    13.6     never (0/10)     0.33
vessel-3x8   mixed      1   ignition  kalman-gated         95%     97%      100%        97%    63.6     never (0/10)     0.29
vessel-3x8   mixed      1   ignition  kalman-source        46%     76%       49%        76%    15.1       8.0 (1/10)     1.03

vessel-3x8   mixed      1   neighbor  ours                  0%      8%       94%        10%     1.3     83.2 (10/10)     1.29
vessel-3x8   mixed      1   neighbor  kalman               96%     96%       98%        96%    12.4     never (0/10)     0.35
vessel-3x8   mixed      1   neighbor  kalman-gated         95%     96%      100%        97%    63.4     never (0/10)     0.29
vessel-3x8   mixed      1   neighbor  kalman-source        57%     85%       43%        87%    13.5     never (0/10)     1.06

vessel-3x8   mixed      1   far       ours                  0%      9%       94%         9%     1.5     75.6 (10/10)     1.23
vessel-3x8   mixed      1   far       kalman               97%     97%       99%        97%    12.0     never (0/10)     0.34
vessel-3x8   mixed      1   far       kalman-gated         94%     97%      100%        97%    62.7     never (0/10)     0.29
vessel-3x8   mixed      1   far       kalman-source        68%     61%       45%        66%    13.6       8.0 (1/10)     1.06

vessel-3x8   mixed      1   random    ours                  0%     14%       47%        40%   237.8       9.0 (1/10)     0.33
vessel-3x8   mixed      1   random    kalman               21%     97%       99%        97%   129.9     never (0/10)     0.13
vessel-3x8   mixed      1   random    kalman-gated         18%     97%       99%        97%   133.3     never (0/10)     0.12
vessel-3x8   mixed      1   random    kalman-source         7%     88%       38%        91%   354.6     never (0/10)     0.58

vessel-3x8   mixed      2   ignition  ours                  0%      8%       93%        10%     1.9     83.0 (10/10)     1.23
vessel-3x8   mixed      2   ignition  kalman               97%     97%      100%        97%    13.6     never (0/10)     0.36
vessel-3x8   mixed      2   ignition  kalman-gated         95%     97%      100%        97%    63.6     never (0/10)     0.30
vessel-3x8   mixed      2   ignition  kalman-source        46%     76%       49%        76%    15.1       8.0 (1/10)     1.06

vessel-3x8   mixed      2   neighbor  ours                  0%      8%       94%        10%     1.3     83.2 (10/10)     1.26
vessel-3x8   mixed      2   neighbor  kalman               96%     96%       98%        96%    12.4     never (0/10)     0.37
vessel-3x8   mixed      2   neighbor  kalman-gated         95%     96%      100%        97%    63.4     never (0/10)     0.31
vessel-3x8   mixed      2   neighbor  kalman-source        57%     85%       43%        87%    13.5     never (0/10)     1.05

vessel-3x8   mixed      2   far       ours                  0%      9%       94%         9%     1.5     75.6 (10/10)     1.16
vessel-3x8   mixed      2   far       kalman               97%     97%       99%        97%    12.0     never (0/10)     0.36
vessel-3x8   mixed      2   far       kalman-gated         94%     97%      100%        97%    62.7     never (0/10)     0.29
vessel-3x8   mixed      2   far       kalman-source        68%     61%       45%        66%    13.6       8.0 (1/10)     1.02

vessel-3x8   mixed      2   random    ours                  0%     11%       48%        40%   233.6       9.0 (1/10)     0.31
vessel-3x8   mixed      2   random    kalman               21%     96%       98%        97%   130.8     never (0/10)     0.13
vessel-3x8   mixed      2   random    kalman-gated         18%     97%       99%        97%   133.0     never (0/10)     0.12
vessel-3x8   mixed      2   random    kalman-source         7%     89%       38%        91%   335.0     never (0/10)     0.61

vessel-3x8   mixed      3   ignition  ours                  0%      8%       93%        10%     1.9     83.0 (10/10)     1.25
vessel-3x8   mixed      3   ignition  kalman               97%     97%      100%        97%    13.6     never (0/10)     0.37
vessel-3x8   mixed      3   ignition  kalman-gated         95%     97%      100%        97%    63.6     never (0/10)     0.31
vessel-3x8   mixed      3   ignition  kalman-source        46%     76%       49%        76%    15.1       8.0 (1/10)     1.07

vessel-3x8   mixed      3   neighbor  ours                  0%      8%       94%        10%     1.3     83.2 (10/10)     1.22
vessel-3x8   mixed      3   neighbor  kalman               96%     96%       98%        96%    12.4     never (0/10)     0.36
vessel-3x8   mixed      3   neighbor  kalman-gated         95%     96%      100%        97%    63.4     never (0/10)     0.30
vessel-3x8   mixed      3   neighbor  kalman-source        57%     85%       43%        87%    13.5     never (0/10)     1.03

vessel-3x8   mixed      3   far       ours                  0%      9%       94%         9%     1.5     75.6 (10/10)     1.23
vessel-3x8   mixed      3   far       kalman               97%     97%       99%        97%    12.0     never (0/10)     0.39
vessel-3x8   mixed      3   far       kalman-gated         94%     97%      100%        97%    62.7     never (0/10)     0.30
vessel-3x8   mixed      3   far       kalman-source        68%     61%       45%        66%    13.6       8.0 (1/10)     1.07

vessel-3x8   mixed      3   random    ours                  0%     15%       48%        41%   228.6       9.0 (1/10)     0.28
vessel-3x8   mixed      3   random    kalman               21%     96%       96%        96%   131.6     never (0/10)     0.12
vessel-3x8   mixed      3   random    kalman-gated         18%     97%       99%        97%   132.8     never (0/10)     0.11
vessel-3x8   mixed      3   random    kalman-source         7%     91%       38%        92%   322.4     never (0/10)     0.57
```

note: k (freeze/blind budget) only changes the freeze, blind and mixed cells with target=random; with a named target there is one sensor to break, and saturate/flashover ignore k, so those k=1/2/3 rows are identical by construction.

### Where ours loses

```
WHERE OURS LOSES
  demo-6 saturate k=1 target=random: wrongDispatch 49% > kalman-source 7% | coverage ours 88% vs 55%, err 304.5 vs 310.0
  demo-6 saturate k=2 target=random: wrongDispatch 49% > kalman-source 7% | coverage ours 88% vs 55%, err 304.5 vs 310.0
  demo-6 saturate k=3 target=random: wrongDispatch 49% > kalman-source 7% | coverage ours 88% vs 55%, err 304.5 vs 310.0
  vessel-3x8 saturate k=1 target=random: wrongDispatch 46% > kalman-source 21% | coverage ours 89% vs 49%, err 314.2 vs 317.2
  vessel-3x8 saturate k=2 target=random: wrongDispatch 46% > kalman-source 21% | coverage ours 89% vs 49%, err 314.2 vs 317.2
  vessel-3x8 saturate k=3 target=random: wrongDispatch 46% > kalman-source 21% | coverage ours 89% vs 49%, err 314.2 vs 317.2
  tower-5x4 saturate k=1 target=random: wrongDispatch 41% > kalman-source 23% | coverage ours 87% vs 45%, err 300.9 vs 306.4
  tower-5x4 saturate k=2 target=random: wrongDispatch 41% > kalman-source 23% | coverage ours 87% vs 45%, err 300.9 vs 306.4
  tower-5x4 saturate k=3 target=random: wrongDispatch 41% > kalman-source 23% | coverage ours 87% vs 45%, err 300.9 vs 306.4
```

Diagnosis, one paragraph per distinct case:

- demo-6, vessel-3x8 and tower-5x4, saturate, target=random, k=1/2/3 (nine cells, three distinct: saturate ignores k, so the k rows are the same run): saturate pins every sensor whose true temperature exceeds 300 C at exactly 300 C, with no k limit, and with a random target that is every hot sensor. From about tick 20 the brain sees six identical 300 C readings that are physically consistent with a structure that has burned out; the forced-space rule (a trusted reading above ignition for three ticks) keeps burned-out spaces, at 800 C in truth with no fuel left, in the burning set until the assumed fuel budget runs out. That is a wrong dispatch on about half the ticks. The source filter says less (coverage 55 %, 49 %, 45 % against ours' 88 %, 89 %, 87 %) and so is wrong less. Ours' false certainty in these cells is 0 %: it is wrong at confidence 0.05, not sure. Diagnosis by probe, demo-6 seed 1: 56 wrong ticks of 120, every one a burned-out space with fuel 0 whose sensor reads 300.

No other aggregated cell has ours above the best baseline on false certainty or wrong dispatch. Ours' scalar false certainty (confidence ≥ 0.9 with a wrong set) is 0 % in every cell of the table. Its false certainty on P(burning) at 0.9 is not zero: the plan-by-mode means are 2 to 15 %, and the worst distinct cells are demo-6 flashover random 49 %, demo-6 mixed random 39 to 44 % and vessel-3x8 flashover random 33 % (the k rows repeat), all with a random target under flashover or mixed, where a burned-out space next to a live fire is held above 0.9 for a stretch of ticks. Reported as is; pre-registered expectation 1 in section 3 of the plan (0 % at P ≥ 0.9) is therefore NOT met on the random-target family, and is met on the named-target families only at the 1 to 9 % level, not 0.
