# Dean · Checkpoint 1 · hour 12 · Sun 12:00 AM ET (Sat midnight)

**Goal.** A failure model with real modes, a competent Kalman baseline, and a loop that runs two brains on identical observations so the sim prints the moment the baseline goes confidently wrong. This is the evidence behind the check-in 1 video: "the fire destroys its own sensors, and textbook estimators converge confidently on the wrong answer."

Run the three prompts in order. Prompts 1 and 2 are independent of Chase's physics work. Prompt 3 is much more convincing once his fire actually spreads, so do it last.

---

## Prompt 1 · The failure model

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

TASK: implement the corruption model in src/corruption/. This is the class of measurement
and communication failures the whole project is evaluated against, so it must be precise
enough to analyze and strong enough to reflect the scenario.

CONTRACT CHANGE (additive, tell Chase in your final report): replace CorruptionConfig in
src/shared/types.ts with:

  export type CorruptionMode = 'none' | 'freeze' | 'blind' | 'saturate' | 'flashover' | 'mixed';
  export type CorruptionConfig = {
    seed: number;
    mode: CorruptionMode;
    k?: number;             // max number of sensors corrupted at once. default 2.
    onset?: number;         // first tick failures may begin. default 5.
    target?: SpaceId[];     // restrict corruption to sensors in these spaces. omit = any.
    flashoverTemp?: number; // temp above which a space's sensors all die. default 500.
    saturateAt?: number;    // temp at which a sensor pins. default 300.
  };

Every field is a knob Chase's chaos panel will render, so keep the type flat and every
field optional except seed and mode. Export a DEFAULT_CORRUPTION value from
src/corruption/index.ts holding the defaults for every optional field.

MODES. The corruptor sees the CLEAN observation (true temps at sensor locations plus tiny
noise). It may key failures off those clean temps. It never imports src/world.

  freeze:    at onset, pick up to k sensors (respecting target). From then on each frozen
             sensor reports the value it had at the tick it froze, with `t` also frozen at
             that tick. The reading LOOKS stale only via `t`; the temp looks plausible.
  blind:     at onset, pick up to k sensors. A blinded sensor reports ambient-ish (plan
             ambient + small noise) regardless of truth, with a current `t`. This is the
             "smoke makes the thermal camera read cold where it is hottest" failure.
  saturate:  any sensor whose clean temp exceeds saturateAt reports exactly saturateAt.
             No k limit: this is physics, it hits every hot sensor.
  flashover: any space whose clean temp exceeds flashoverTemp has EVERY sensor in it
             (fixed and drone-borne) removed from the readings, permanently, and any drone
             in it gets alive:false, linked:false in its self-report. This is the
             correlated failure. It is not bounded by k.
  mixed:     freeze + blind (sharing the k budget) + saturate + flashover all active.
  none:      identity.

Corrupted sensor identity must persist across ticks (once frozen, stays frozen). Keep
per-sensor state in a Map inside the closure. reset(seed) clears it.

DRONE SELF-REPORTS: in freeze mode, a drone whose temp sensor is frozen also has its
self-report frozen (same at, same resource). Model comms loss: in mixed mode, with
probability 0.02 per tick per drone, set linked:false for that drone and drop its readings
and self-report for that tick only.

DETERMINISM: every draw through makeRng(config.seed).fork('corruption'). Sensor selection
must be a deterministic function of seed, not of the iteration order of a Set.

TESTS: src/corruption/corruption.test.ts. Build Observation objects by hand (do not import
the world). For each mode assert:
  - 'none' returns a deep-equal observation.
  - 'freeze' with k=1 onset=2: readings for exactly one sensor stop changing after tick 2
    and its t stops advancing; all other readings are untouched.
  - 'blind' with target=['S3']: the S3 sensor reports within 5C of ambient even when its
    clean temp is 450; other sensors untouched.
  - 'saturate': a reading of 800 becomes exactly saturateAt; a reading of 100 is untouched.
  - 'flashover': a space at 600 has zero readings in the output and its drone shows
    alive:false.
  - same seed, same input sequence, same output sequence (run twice, JSON.stringify equal).

DOCS: write the "Failure model" section of README.md. Cover, per the Defense brief: what
can fail, fixed vs changing subset (freeze/blind: fixed after onset; saturate/flashover:
changing, driven by physics), bounded vs arbitrary magnitude, correlation (flashover kills
all sensors in a space at once), and what stays trusted (the structure plan and the heat
physics on its edges). Keep it under 300 words.

DO NOT TOUCH: src/world, src/ui, src/brain, src/loop.ts.
```

---

## Prompt 2 · Kalman baseline and the two-brain loop

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

TASK: build a competent Kalman filter baseline as a second Brain implementation, and make
the loop able to run more than one brain on identical observations.

PART A: src/brain/kalman.ts exporting createKalmanBrain(config: BrainConfig): Brain.

State x: one temperature per space, in plan order. Process model, per tick:
  x_i' = x_i + sum_over_edges(rate_e * (x_j - x_i)) + g * b_i
where rate_e comes from plan.edges (use edgeMap from src/shared/plan.ts), b_i is 1 if the
filter currently believes space i is burning else 0, and g is a heat generation constant
(assume 40 C/tick; make it a named constant). This makes A = I + L where L is the
weighted graph Laplacian, which is linear, so the Kalman update is exact.

Measurement: y = H x + v. H selects the space of each reading in obs.readings (one row per
reading; a space with two readings gets two rows). R = sigma^2 I with sigma = 2 C. Q =
q I with q = 25. Initial P = 100 I, x0 = ambient.

Implement predict and update with plain arrays (no numeric library; n is at most a few
dozen). A small matrix helper module src/brain/mat.ts is fine: matmul, transpose, add,
inverse via Gauss-Jordan for the (m x m) innovation covariance. Add unit tests for the
helpers.

burningSet = spaces with x_i > 200. confidence = mean over spaces of
  1 - min(1, sqrt(P_ii) / 50)
i.e. a filter that has converged to small covariance reports high confidence REGARDLESS of
whether its readings are lies. That is the point of the baseline and the thing we beat.
ambiguous = [] always. suspectSensors = [] always. commands = [].

The Kalman brain must use every reading it is given. It does not know about corruption.
That is the honest baseline the Defense brief asks for ("a method that assumes ordinary
independent noise").

PART B: src/loop.ts (shared file; small, additive change; tell Chase).

  - Add brain?: (cfg: BrainConfig) => Brain to LoopConfig, defaulting to createBrain.
  - Change corruption to accept the full CorruptionConfig (minus seed, which the loop
    supplies) instead of the mode-only string. Default { mode: 'none' }.
  - Export runLoopMulti(cfg: LoopConfig & { brains: Record<string, (cfg: BrainConfig) => Brain>; primary?: string })
    which runs ONE world and ONE corruptor and feeds the same corrupted observation to
    every brain each tick. Commands come from the brain named by primary if given, else
    the first key. Returns Record<string, TickRecord[]> keyed by brain name. This matters:
    the brains must see byte-identical observations or the comparison is invalid.
  - Update the CLI path so `npm run sim` runs { ours: createBrain, kalman: createKalmanBrain }
    and formatTick prints both burning sets and both confidences on one line:
      t= 12 truth=[S3,S2] ours=[S3,S2] c=0.71 kalman=[S3] c=0.98 err=4.1/9.8 rd=8
    Add CLI flags --mode <CorruptionMode> --k <n> --onset <n> --target S3,S4.

TESTS:
  - src/brain/kalman.test.ts: on a hand-built Observation stream with clean readings for a
    single hot space, the estimate for that space converges within 3C in 20 ticks and
    confidence rises above 0.9.
  - src/loop.test.ts: add a test that runLoopMulti with two brains yields traces whose
    obs arrays are JSON-identical tick for tick.

DO NOT TOUCH: src/world, src/ui, src/corruption logic (Prompt 1 owns it).
```

---

## Prompt 3 · The first evidence run

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: src/corruption has modes freeze/blind/saturate/flashover/mixed. src/brain/kalman.ts
is a competent baseline. runLoopMulti feeds both brains identical corrupted observations.
Chase may or may not have landed real fire spread in src/world yet; check git log and
src/world/index.ts. Either way, proceed.

TASK: produce the one run that shows the baseline going confidently wrong, make it
reproducible with a single command, and improve the v0 estimator just enough that it does
not do the same thing.

PART A: add scripts to package.json:
  "sim:freeze": "tsx src/loop.ts --ticks 60 --mode freeze --k 1 --target <ignition> --onset 5"
  "sim:blind":  "tsx src/loop.ts --ticks 60 --mode blind  --k 1 --target <ignition> --onset 5"
Fill in the ignition space id from data/structures/demo-6.json. Run both and paste the
output in your final report.

PART B: minimal honesty in src/brain/index.ts (v0.1, still simple):
  - Track, per sensor, the last tick its reading changed by more than 0.1C. If a reading's
    t is older than obs.t - 3, OR its value has not changed for 8 ticks while any
    neighbor's reading changed by more than 20C, put the sensor in suspectSensors and
    exclude it from the estimate.
  - Estimate for a space with no trusted reading: mean of trusted neighbor estimates
    (using plan edges), falling back to ambient.
  - confidence = (trusted readings) / (total readings), times 0.5 if any space in
    burningSet has no trusted reading.
This is deliberately crude. The real estimator is checkpoint 2. It just needs to NOT
report confidence 1.0 while trusting a frozen sensor.

PART C: src/eval/evidence.ts, run by `npm run evidence` (add the script): runs the
sim:freeze config through runLoopMulti and prints:
  - the first tick where kalman's burningSet != truth while kalman confidence > 0.9
  - the number of such ticks for kalman and for ours
  - mean abs temp error for each
as a small table. This is the number for the check-in video.

If the world still has constant temps (Chase's physics not landed), the freeze case will
not produce divergence because nothing changes. In that case say so plainly in your
report, and add a fallback: --mode blind on the ignition space, which produces divergence
even with constant truth (blinded sensor says ambient, truth is 450).

DO NOT TOUCH: src/world, src/ui. Do not edit src/brain/kalman.ts in a way that makes it
weaker.
```
