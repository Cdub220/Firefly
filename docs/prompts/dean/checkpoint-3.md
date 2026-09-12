# Dean · Checkpoint 3 · hour 36 · Mon 12:00 AM ET (Sun midnight)

**Goal.** The eval harness. All four metrics from the Defense brief, swept over corruption mode, k, location, and seed, for both brains on identical observations. Then **freeze the method**. Everything after this checkpoint is evaluated against cases chosen after the freeze, which is what makes the numbers valid.

The video for this checkpoint says what surprised us. Prompt 3 produces the material.

---

## Prompt 1 · Four metrics, properly

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: src/eval/metrics.ts has estimationError, falseCertainty, ambiguityCoverage, and
null stubs for timeToRecovery and computeMsPerTick. runLoopMulti in src/loop.ts runs
multiple brains on one observation stream.

TASK: finish the metrics and instrument the loop.

src/loop.ts (shared; additive; tell Chase): add stepMs: number to TickRecord, measured
with performance.now() around brain.step only. Make the corruption onset available to
the metrics (it is in the CorruptionConfig the loop already receives; surface it on the
returned trace or as a field on LoopConfig).

src/eval/metrics.ts, computeMetrics(trace, opts: { onset: number; confidenceThreshold?: number }):
  estimationError:    mean |estimate - truth temp| over spaces and ticks >= onset.
  falseCertainty:     fraction of ticks >= onset with confidence >= threshold (0.9) AND
                      burningSet != truth set. Sets compared as sorted id lists.
  ambiguityCoverage:  fraction of ticks >= onset where truth is a subset of
                      burningSet union all ambiguous groups.
  timeToRecovery:     ticks from onset until the first tick where burningSet == truth for
                      5 consecutive ticks. null if never.
  computeMsPerTick:   mean stepMs.
  wrongDispatch:      fraction of ticks >= onset where burningSet contains a space that is
                      NOT burning in truth AND is not in any ambiguous group. This is the
                      "drone sent to the wrong floor" number, the operational cost.
Return all six. Keep the function pure.

Add src/eval/metrics.test.ts with a synthetic trace where you know the answers.

DO NOT TOUCH: src/world, src/ui, src/brain, src/corruption.
```

---

## Prompt 2 · The sweep

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: computeMetrics returns six metrics. runLoopMulti runs both brains on identical
observations. data/structures/ has demo-6.json and whatever multi-level plans Chase has
added (list them). src/shared/structures.ts exports PLAN_NAMES and loadPlan(name).

TASK: src/eval/sweep.ts, run by `npm run sweep`, that produces the head-to-head table.

Grid (make each axis a CLI flag with these defaults):
  plans:   every name in PLAN_NAMES
  modes:   freeze, blind, saturate, flashover, mixed
  k:       1, 2, 3
  target:  'ignition' (the ignition space), 'neighbor' (its hottest neighbor at onset),
           'far' (the space with the longest edge-path from ignition), 'random'
  onset:   5
  seeds:   1..10
  ticks:   120
Brains: ours (createBrain) and kalman (createKalmanBrain). Same world, same corruptor,
same observation stream per (plan, mode, k, target, seed) cell.

Output:
  - results/sweep-<timestamp>.json: one row per cell per brain with all six metrics.
  - results/sweep-latest.json: same, overwritten.
  - stdout: a summary table aggregated over seeds, one row per (plan, mode, k, target),
    columns: brain, falseCert, coverage, wrongDispatch, err, ttr, ms. Print ours and kalman
    on adjacent rows. Plain fixed-width text; it goes in a video.
  - A final block "WHERE OURS LOSES": every cell where ours has higher falseCertainty or
    wrongDispatch than kalman, listed explicitly. The brief says a result that fails under
    a difficult case is useful if we diagnose it. Do not hide these.

Add a --quick flag (2 seeds, 60 ticks) for iteration. The full sweep must finish in under
5 minutes on a laptop; if it does not, reduce seeds and say so.

Add src/eval/sweep.test.ts that runs --quick on demo-6 with one mode and asserts the
output JSON has the expected row count and every metric is finite.

DO NOT TOUCH: src/world, src/ui, src/brain, src/corruption.
```

---

## Prompt 3 · Freeze, and what surprised us

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: `npm run sweep` produces results/sweep-latest.json and a WHERE OURS LOSES block.
It is about hour 35. The method freezes at hour 36 (Mon 12:00 AM ET).

TASK: execute the freeze procedure and write the checkpoint-3 notes. This prompt changes
NO estimator or corruption logic. If you find a bug, report it; a human decides whether to
fix before freezing.

1. Run `npm run sweep` (full, not quick). Commit results/sweep-latest.json.
2. Write docs/06-freeze.md:
   - The commit hash of HEAD after step 1.
   - The exact CorruptionConfig type and the list of modes as frozen.
   - A one-paragraph description of the estimator as frozen: consistency rules, hypothesis
     enumeration, k-residual dropping, confidence formula. A judge who asks "what exactly
     did you freeze" gets this paragraph.
   - The sweep summary table pasted verbatim.
   - The WHERE OURS LOSES block pasted verbatim with one sentence of diagnosis per row.
     If you cannot diagnose a row, write "undiagnosed".
3. Update the "Method freeze" section of README.md with the hash and a link to
   docs/06-freeze.md.
4. Write docs/07-what-surprised-us.md. Look at the sweep. Answer, in plain sentences
   with numbers: Which failure mode hurt the baseline most and why? Which hurt ours most?
   Was there a target location (ignition / neighbor / far) where ambiguity coverage
   dropped, and what does that say about sensor placement? Did k=3 break anything? Did
   the multi-level plan behave differently from the single-level one? This file is the
   script for the check-in 3 video. Three to five findings, each one paragraph, each with
   a number from the sweep.
5. Add src/eval/freeze.test.ts that reads docs/06-freeze.md, extracts the hash, and runs
   git diff <hash> HEAD --stat -- src/brain/index.ts src/brain/consistency.ts src/brain/hypotheses.ts src/brain/physics.ts src/corruption/
   via child_process, asserting the output is empty. From now on, any change to frozen
   files fails the test suite. Skip the test if docs/06-freeze.md does not exist so it
   does not break before the freeze.

DO NOT TOUCH: src/brain, src/corruption, src/world, src/ui.
```
