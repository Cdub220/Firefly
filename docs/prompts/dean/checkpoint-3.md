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

## Prompt 2b · A fair baseline: the source-estimating Kalman filter

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: The Kalman baseline (src/brain/kalman.ts) estimates temperatures and calls a space
"burning" when its estimate is above 200 C. That rule is wrong 65% of ticks on a CLEAN run
(88% on vessel-3x8), because a burned-out space or a space heated by its neighbour is hot
but not burning. So the false-certainty column has been measuring our chosen rule, not the
filter. An innovation-gated variant already exists (createGatedKalmanBrain) and does not
help. We will not write our own fire logic into the opponent. The standard, textbook
answer is an AUGMENTED-STATE filter that estimates each space's heat SOURCE and calls a
space burning when the estimated source is significantly positive. Read src/brain/physics.ts
for the world's linear model: a burning space adds g_i * (FLAME_TEMP - x_i) per tick; a
burned-out space adds nothing; a space heated by a neighbour adds nothing of its own.

TASK: src/brain/kalman.ts, export createSourceKalmanBrain(config): Brain.
  State: [x_1..x_n, q_1..q_n], x = temperature, q = heat added per tick by a source in
  that space (C/tick). Process: x' = A0 x + ambientTerm + q  (A0 as in the existing
  filter: I + L - COOL*I, NO generation term: the source is now estimated, not assumed);
  q' = q (random walk) with process noise Q_q = 4 (C/tick)^2 per space, Q_x = 25 as now.
  Measurement: H picks x only. Same R, same P0 for x; P0 for q = 100.
  Burning rule (standard, no fuel guess): a space is burning iff q_hat_i / sqrt(P_qq,i) > 3
  AND q_hat_i > 10 C/tick (a significant, non-trivial source). P(burning) is the posterior
  P(q_i > 10) = Phi((q_hat_i - 10) / sqrt(P_qq,i)). Confidence as now, over the x block.
  No gating in this variant (keep it a clean control); suspectSensors [].
  Keep createKalmanBrain and createGatedKalmanBrain unchanged.

WIRE IT IN: add 'kalman-source' to the brains in src/eval/evidence.ts, src/eval/sweep.ts
(BRAINS, BASELINES so WHERE OURS LOSES compares against the best of all three baselines,
BRAIN_ORDER for the table), src/eval/mismatch.ts, and the sweep test's expected counts.
The split view store stays ours + naive kalman (src/ui/store.ts BRAIN_FACTORIES); do not
add a fourth panel.

TESTS (src/brain/kalman.test.ts, hand-built observations, physics-consistent streams
built with forward() as the existing tests do):
  - Clean burning stream on the test-3 plan: within 20 ticks the source filter names S1
    burning and does NOT name S2 or S3 even once they pass 200 C (they have no source).
  - A space that was burning and then goes out (build the stream with forward() and a
    burning set that drops S1 at tick 20, so it cools while still hot): the source filter
    drops it from burningSet within 10 ticks of the source stopping; the naive filter keeps it.
  - A frozen sensor at the fire plateau: the source filter still believes the fire (same
    weakness as naive; the point is it is fair on clean runs, not that it resists lies).
  - P(burning) is in [0, 1] everywhere, > 0.99 for a strong source, < 0.01 for none.
  - normalCdf is used, not a hard label.

REPORT: run `npm run evidence` and paste the full table into your final message. The
number that matters: the source filter's clean-run (mode none) false certainty. We expect
it to fall from 65% to something small; whatever it is, report it. Then `npm run sweep --
--quick --plans demo-6,vessel-3x8,tower-5x4` and paste WHERE OURS LOSES. If ours now loses
a cell to the source filter, do not touch the estimator; report the cell. Add a decisions.md
row: what the source filter is, why it is the fair baseline, and the clean-run number
before and after.

DO NOT TOUCH: src/brain/index.ts, consistency.ts, hypotheses.ts, physics.ts,
src/corruption, src/world, src/ui.
```

---

## Prompt 2c · Drone readings and the command hook, before the freeze

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: Two things must be true of the estimator BEFORE it freezes, because after the
freeze src/brain/index.ts, consistency.ts, hypotheses.ts and physics.ts cannot change.
Read src/world/index.ts (do not import it) to see that every alive drone already emits a
Reading with source 'drone', sensorId `${droneId}:temp`, droneId set, spaceId = where it
is; the corruptor already drops readings from dead or comms-lost drones. The brain already
consumes those readings like any other, BUT src/brain/consistency.ts keeps per-sensor
history keyed by sensorId and assumes a sensor never moves: a drone that flies from a 20 C
space into a 500 C space looks like an "impossible rise", and a drone parked at resupply
looks "frozen". Also step() returns commands: [] inline; the CP4 allocator must plug in
without editing index.ts after the freeze.

TASK A (consistency, moving sensors): in src/brain/consistency.ts
  - When a sensor's spaceId differs from its previous history entry, treat this tick as
    the first observation from a NEW sensor for the rate-of-change rules: no impossible-rise
    or impossible-drop check against its own previous reading (check against
    prevEstimate[spaceId] instead, which already exists), and reset the frozen-streak.
  - The frozen rule never fires for source 'drone' readings while the drone's spaceId has
    changed within the last FROZEN_TICKS entries. A drone that has sat still for 6 ticks
    while neighbours move IS subject to the frozen rule (a stuck drone lies like a stuck
    sensor).
  - Stale, cold-in-hot-neighbourhood and no-heat-path rules apply to drone readings
    unchanged.
  - Two trusted readings in one space (fixed + drone) already average in the estimate;
    confirm and add a test.
TASK B (command hook): create src/brain/commands.ts exporting
  planCommands(input: { plan: StructurePlan; belief: Belief; kept: Set<SpaceId>[]; drones: Drone[]; prev: Command[] }): Command[]
  returning [] today, with a doc comment saying this is the unfrozen hook the CP4
  allocator fills in. In src/brain/index.ts replace the inline `commands: []` with a call
  to planCommands(...) passing the kept hypothesis sets and last tick's commands (keep
  prevCommands in the closure; reset clears it). That is the LAST edit to index.ts before
  the freeze. Update docs/06-freeze-plan.md section 1 to say the hook exists, so the
  allocator changes commands.ts and allocator.ts only, and docs/prompts/dean/checkpoint-4.md
  prompt 1 so it no longer asks for an index.ts edit or a second hash.

TESTS:
  - src/brain/consistency.test.ts: a drone reading that jumps from S1 (20 C) to S3
    (500 C, matching prevEstimate) is trusted, not "impossible"; the same jump on a FIXED
    sensor id is still flagged. A drone sitting 8 ticks at one value while the median
    neighbour moves 100 C is flagged frozen.
  - src/brain/brain.test.ts: an ambiguity {S2}|{S4} with no fixed sensor in either is
    resolved within 2 ticks once a drone reading arrives from S2 (hot) — the reading that
    the CP4 scout will deliver. Build it by hand: readings from fixed sensors elsewhere plus
    one 'drone' reading in S2.
  - src/brain/commands.test.ts: planCommands returns [] and is what step() calls (spy or
    behavioural: step() output commands equal planCommands output for the same inputs).
  - `npm run evidence` numbers must be unchanged to two decimals (no drones move in the
    evidence runs); paste the table.

Add a decisions.md row for both tasks. DO NOT TOUCH: src/world, src/ui, src/corruption,
src/brain/kalman.ts, src/brain/hypotheses.ts, src/brain/physics.ts.
```

---

## Prompt 2d · The estimator learns that water exists (suppression-aware rollout), last change before the freeze

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: The closed-loop brief (CP4 prompt 3, `npm run brief`) exposed a real estimator
defect: the brain has no model of suppression. When two tethers cool a burning space, the
space stops generating heat, the rollout for "this space is burning" predicts it should be
climbing toward 900 C, the reading says it is falling toward 300 C, so the hypothesis
"not burning" fits better, burningSet drops the space, the allocator retargets the
tethers, the space reignites, and the tethers come back: 24 A-B-A retargets per tether in
60 ticks on vessel-3x8 seed 1, and most of ours' wrong-floor commands and drone deaths.
The world's effect of a tether with task 'suppress' in a space (read src/world/drones.ts
and src/world/physics.ts, do not import them): generation multiplied by
TETHER_SUPPRESSION = 0.3 per tether (two stack to 0.09) and an extra cooling term of
TETHER_COOL = 0.1 × (ambient − T) per tether; the space stays burning in truth until its
fuel is gone. src/brain/physics.ts already declares TETHER_COOL and MAX_TETHERS and uses
them for the impossible-drop bound, so the consistency rules already tolerate suppressed
cooling; only the hypothesis rollout and the estimate are blind to it. This is the LAST
estimator change before the freeze; keep it minimal and mechanical.

TASK A (physics): in src/brain/physics.ts add `export const TETHER_SUPPRESSION = 0.3`
(mirror of the world's constant, with a comment saying so) and give forward() an optional
fourth argument `suppression?: ReadonlyMap<SpaceId, number>` (tethers working each space,
capped at MAX_TETHERS). For a burning space with n tethers: generation is multiplied by
TETHER_SUPPRESSION ** n and dT gains n × TETHER_COOL × (ambient − T). For a non-burning
space with tethers, only the cooling term applies. No argument = no suppression = today's
behaviour, so every existing call and test is unchanged.

TASK B (rollout): src/brain/hypotheses.ts predict() and score() take the same optional
suppression map and pass it to every forward() step of the rollout. Assume the tether
placement is constant over the ROLLOUT window (three ticks); that is the simplest thing
that is right, and tethers move slowly.

TASK C (the brain): in src/brain/index.ts, each tick build
  tethersAt: Map<SpaceId, number> = count of drones in sane.drones with class 'tether' and
  alive === true, per space, capped at MAX_TETHERS.
Use OBSERVED drones, not prevCommands: a tether standing in a space is working it (the
allocator only ever sends tethers to suppress), and this keeps the estimator's input to
the Observation alone, which is what the freeze scope says. Pass tethersAt into every
score() call, into the one-step predict() that fills the estimate for unsensed spaces,
and into the blackout carry-forward predict(). Do not change the forced-space rule, the
fuel budget, the tolerance, the confidence formula, or the probability cap. The
observation-only diet is preserved: nothing new is imported.

TESTS:
  - src/brain/physics.test.ts: forward() with two tethers on a burning space at 800 C
    produces a lower next temperature than without, by the world's formula (compute the
    expected value by hand in the test); a space with tethers but not burning only cools;
    three tethers count as MAX_TETHERS.
  - src/brain/brain.test.ts, the regression: a physics-consistent stream on the test-3 plan
    where S1 burns for 15 ticks, then two alive tether drones appear at S1 in obs.drones and
    the stream from tick 16 is generated with forward(..., suppression={S1: 2}) so S1 falls
    from ~800 toward ~300 while still burning. Assert S1 stays in burningSet on every tick
    16–40 with the drones present. Control: the same temperature stream with NO drones in
    obs.drones must NOT be required to keep S1 (document the observed behaviour in the test
    name; it may drop S1, which is the defect this prompt fixes when tethers are visible).
  - src/brain/brain.test.ts, closed loop: runLoop on demo-6, seed 1, 60 ticks, dispatch
    true, two tethers in the drone roster, mode none. Count burningSet flips (a space that
    leaves burningSet and re-enters it later). Assert flips <= 3 for the whole run. Before
    this prompt the same run flips many times; print the before/after count in your report.
  - `npm run evidence` must be byte-identical to results/evidence-cp2.json (open-loop runs
    have no drones, so nothing may change). Assert that in your report, not in a test.

REPORT: rerun `npm run brief -- --plan vessel-3x8 --mode flashover --seed 7 --ticks 120`
and the task-D brief sweep from CP4 prompt 3, and update the CP4-prompt-3 decisions row
with the new means (extinguishedAt, tetherTicks, retardantSpent, droneDeaths, wrongFloor)
for ours / kalman / kalman-source, before and after this change. If wrongFloor or drone
deaths do not improve, say so and stop; do not tune anything else. Add a decisions.md row
for this prompt: the defect, the fix, and the flip counts before and after.

DO NOT TOUCH: src/brain/allocator.ts, src/brain/commands.ts, src/brain/kalman.ts,
src/corruption, src/world, src/ui, src/eval.
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
2. Write docs/06-freeze.md. Start by copying sections 1 (scope) and 2 (held-out families) of
   docs/06-freeze-plan.md verbatim; they were written before the freeze on purpose. Then add:
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
5. In .github/workflows/ci.yml set `fetch-depth: 0` on actions/checkout so the freeze test can
   diff against the recorded hash in CI.
6. Add src/eval/freeze.test.ts that reads docs/06-freeze.md, extracts the hash, and runs
   git diff <hash> HEAD --stat -- src/brain/index.ts src/brain/consistency.ts src/brain/hypotheses.ts src/brain/physics.ts src/corruption/
   via child_process, asserting the output is empty. From now on, any change to frozen
   files fails the test suite. Skip the test if docs/06-freeze.md does not exist so it
   does not break before the freeze.

DO NOT TOUCH: src/brain, src/corruption, src/world, src/ui.
```
