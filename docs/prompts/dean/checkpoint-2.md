# Dean · Checkpoint 2 · hour 24 · Sun 12:00 PM ET

**Goal.** The real estimator. It uses the structure's heat physics as a trusted reference, flags sensors that contradict it, separates "hot here" from "burning here," and reports ambiguity as a set of candidate fire states with honest confidence. The video shows one number: our false certainty versus the baseline's on one corruption case.

Prompt 1 is the core. Prompt 2 adds ambiguity. Prompt 3 gets the number.

---

## Prompt 1 · Physical consistency check

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: src/brain/index.ts is a crude v0.1 estimator. src/brain/kalman.ts is the baseline.
src/corruption has modes freeze/blind/saturate/flashover/mixed. src/shared/plan.ts exports
edgeMap(plan) giving per-space edges with rates. Chase's world spreads fire along those
edges with heat generation in burning spaces and fuel burn-down; read src/world/constants.ts
to learn the constants he used (ignition temp, generation rate, thresholds) but DO NOT
import it. Copy the constants you need into src/brain/physics.ts with a comment saying
they are assumed properties of the structure, not read from the world.

TASK: build src/brain/physics.ts and src/brain/consistency.ts, then wire them into
src/brain/index.ts.

src/brain/physics.ts:
  - forward(plan, temps: Record<SpaceId,number>, burning: Set<SpaceId>): Record<SpaceId,number>
    One tick of the SAME linear heat model the Kalman baseline uses (edge rates, plus
    generation g in burning spaces). This is the brain's model of the world. It is allowed
    to be slightly wrong relative to Chase's sim; that is realistic.
  - steadyState(plan, burning: Set<SpaceId>, iters = 200): Record<SpaceId,number>
    Iterate forward() from ambient until the max change is < 0.5C. Cache by burning-set key.
  - maxRise(plan, spaceId, temps): number
    The largest one-tick temperature increase physically possible in that space given its
    neighbors' current estimates and its edges, plus g if it could be burning. Anything
    larger is a lie.

src/brain/consistency.ts exporting
  checkConsistency(plan, obs, prevEstimate, history): { trusted: Reading[]; suspect: Array<{ sensorId: string; reason: Reason }> }
  type Reason = 'stale' | 'frozen' | 'impossible-rise' | 'cold-in-hot-neighborhood' | 'no-heat-path'
Rules, applied in order, each removing sensors from the trusted pool:
  stale:      reading.t < obs.t - 2.
  frozen:     value unchanged (|delta| < 0.05) for 6 consecutive ticks while the median
              trusted neighbor reading moved by more than 15C over the same window.
  impossible-rise: reading.temp - prevEstimate[space] > maxRise(...) + 3 * sigma.
  cold-in-hot-neighborhood: reading says < ambient + 10 while every neighbor with a
              trusted reading says > 250 AND there is an open door/passage edge to at
              least one of them. Heat cannot fail to cross an open door for many ticks.
  no-heat-path: reading says > 200 while no space within 2 edges has a trusted reading
              > 60 and the previous estimate for this space was < 60. Fire cannot appear
              in an isolated space with no heat path. Exception: skip this rule for
              obs.t <= 3, because the initial fire has to start somewhere.
Keep per-sensor history in the brain closure. reset() clears it.

Wire into src/brain/index.ts step():
  1. consistency -> trusted readings + suspectSensors.
  2. estimate: for spaces with a trusted reading, use it; otherwise propagate one
     forward() step from the previous estimate with the previous burningSet. This is a
     predictor-corrector using physics as the predictor.
  3. burningSet (for now): spaces whose estimate > 200. Prompt 2 replaces this.
  4. confidence: fraction of spaces whose estimate is backed by a trusted reading within
     one edge, times 0.8 ^ (number of suspect sensors). Prompt 2 replaces this.

TESTS: src/brain/consistency.test.ts with hand-built observation sequences for each rule:
a frozen sensor is caught within 8 ticks; a blinded sensor next to a 450C neighbor through
an open door is caught; a lone 450C reading in an isolated space at t=20 is flagged
no-heat-path; a clean spreading fire (readings produced by physics.forward itself) flags
nothing. That last test is the false-positive guard and it must pass.

DO NOT TOUCH: src/world, src/ui, src/corruption, src/brain/kalman.ts.
```

---

## Prompt 2 · Ambiguity as sets, not points

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: src/brain/consistency.ts flags suspect sensors; src/brain/physics.ts has
forward() and steadyState(). The estimator in src/brain/index.ts still picks burningSet by
thresholding temps.

TASK: replace burningSet selection with hypothesis-set estimation so that when the
surviving readings cannot separate two fire states, the brain reports both.

src/brain/hypotheses.ts:
  - candidates(plan, prevBurning: Set<SpaceId>, trustedHot: SpaceId[]): Set<SpaceId>[]
    Enumerate candidate burning sets: the previous set; the previous set plus any one
    neighbor (through any edge) of a burning space; the previous set minus any one space;
    any single space with a trusted reading > 200; and for each trusted hot space, the
    set {it} plus each one of its neighbors. Dedupe. Cap at 64 candidates by preferring
    sets closest in size to the previous set. Fire grows to neighbors, so the candidate
    space is small.
  - score(plan, hypothesis, trusted: Reading[], prevEstimate, k: number): number
    Predicted temps = steadyState(plan, hypothesis) blended 50/50 with one forward() step
    from the previous estimate (steady state alone over-predicts early). Residual per
    trusted reading = |predicted - reading|. Because up to k sensors may still be lying
    undetected, DROP the k largest residuals, then score = mean of the rest. This is the
    secure-estimation trick from the Defense brief's y = Hx + a framing: the estimator
    tolerates a sparse corruption of size k without knowing which entries.
  - Use k = 2 by default; expose it in BrainConfig as k?: number (additive contract
    change, tell Chase).

In src/brain/index.ts step():
  - Score every candidate. best = min score. Keep all hypotheses with
    score <= best + tolerance, where tolerance = max(8, 0.15 * best).
  - burningSet = the intersection of all kept hypotheses (the "certainly burning" core).
    If the intersection is empty, use the smallest kept hypothesis. Document why in a
    comment.
  - ambiguous = spaces that appear in some but not all kept hypotheses, grouped into
    connected components over plan edges. If only one hypothesis survives, ambiguous = [].
  - confidence = 1 / (number of kept hypotheses), times the consistency penalty from
    Prompt 1, clamped to [0.05, 1]. Two equally good hypotheses gives confidence 0.5. That
    is what "honest" means here.
  - estimate = predicted temps of the best hypothesis for spaces without a trusted
    reading; trusted readings where present.

TESTS: src/brain/hypotheses.test.ts.
  - A plan with three spaces in a line A-B-C, fire in B, readings at A and C only (B's
    sensor flashed over). Assert burningSet contains B and confidence < 1 if A and C
    readings are symmetric.
  - Same plan, add a trusted reading at B of 450: assert one hypothesis survives and
    confidence > 0.9.
  - Freeze the B sensor at 22 while A and C rise: assert B ends up suspect and burningSet
    still contains B within 10 ticks (the physics says so even though the sensor lies).

PERFORMANCE: log ms per step in a test on the 6-space plan; must be < 5ms. Chase's plans
will reach about 30 spaces; steadyState caching matters.

DO NOT TOUCH: src/world, src/ui, src/corruption, src/brain/kalman.ts.
```

---

## Prompt 3 · The one number

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: The estimator in src/brain now has consistency checking and hypothesis sets.
src/eval/evidence.ts prints a small table for one config.

TASK: turn evidence.ts into the checkpoint-2 number and make it a one-liner.

  - Extend computeMetrics in src/eval/metrics.ts. falseCertainty is defined exactly as:
    fraction of ticks after corruption onset where confidence >= 0.9 AND burningSet !=
    truth burning set. Add ambiguityCoverage: fraction of ticks where the true burning set
    is a subset of (burningSet union every ambiguous group). High coverage with low false
    certainty is the claim.
  - `npm run evidence` runs the freeze, blind, and flashover cases (k=1, target = the
    ignition space and its hottest neighbor, onset 5, seeds 1..5) through runLoopMulti
    with both brains and prints one table: mode | brain | falseCertainty |
    ambiguityCoverage | meanAbsErr. Also writes results/evidence-cp2.json (create
    results/, commit it).
  - Print at the bottom one sentence formatted for the video, e.g.
    "freeze: kalman false-certain 71% of ticks, ours 4%, coverage 96%."

If the numbers are bad, do not tune blindly. Add a --verbose flag that prints
suspectSensors with reasons per tick, report which rule fired wrongly, and stop.
Diagnosis is the deliverable; tuning is a human call because the freeze is at hour 36.

DO NOT TOUCH: src/world, src/ui.
```

---

## Prompt 4 · Graded belief (pre-freeze, added Sat night)

Why this exists: in the split view, late in the freeze run every space reads over 800° from a fresh honest sensor, yet the brain reports only one or two as certain and the rest as one flat MAYBE. A commander would rather see "these three at 95%, that one at 50%." This adds a per-space probability so ambiguity is graded, and tightens the rule that fresh, physically consistent, above-ignition readings count as burning. It must land before the hour-36 freeze.

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, docs/decisions.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: src/brain/index.ts is the v1 estimator: consistency check -> candidate burning
sets -> score with k-residual dropping -> keep every hypothesis within tolerance of the
best -> burningSet = intersection, ambiguous = contested spaces, confidence = 1/kept x
penalties, capped until stable. Run `npm run viewer` and open results/viewer-freeze.html,
scrub to tick 50: truth has five spaces burning and S3 burned out; ours reports S1,S2
certain and S3..S6 as one MAYBE group at confidence 0.16, even though F4,F5,F6 are fresh,
honest, and reading over 800°. That is the defect. Kalman calls all six burning at 0.97,
including S3 whose only sensor froze at tick 5.

TASK, three parts. The estimator is NOT frozen yet; this is the last change to it.

PART A — per-space probability (additive contract change; tell Chase; the split view in
src/ui/split already renders it when present).
  - Add `probability: Record<SpaceId, number>` to Belief in src/shared/types.ts.
  - In src/brain/index.ts, compute it from the kept hypotheses: weight each kept
    hypothesis by exp(-(score - best) / T) with T = the tolerance, so a hypothesis at the
    edge of tolerance weighs ~e^-1 of the best. probability[s] = weighted fraction of kept
    hypotheses containing s. Every space gets a value, including 0 for spaces in no
    hypothesis.
  - Multiply probability[s] by the consistency penalty ONLY for spaces whose own sensor is
    suspect (a distrusted sensor lowers certainty about its own space, not about every
    space).
  - Kalman brain: probability[s] = 1 if estimate > 200 else 0, times its scalar confidence.
    It has no notion of per-space doubt; that is the point.
  - Keep burningSet and ambiguous exactly as they are so nothing downstream breaks.

PART B — fresh honest hot readings count. Add to the hypothesis scoring a rule, implemented
as a candidate-generation change not a threshold override: any space with a TRUSTED reading
above the ignition temperature (copy the constant from src/world/constants.ts with a comment
that it is an assumed property of the structure) for 3 consecutive ticks is included in
every candidate. Rationale: physics says a space that stays above ignition with fuel is
burning; the hypothesis set should not be allowed to omit it. A space whose sensor is
suspect gets no such rule. Test that on the freeze run at tick 50, S4,S5,S6 are in
burningSet and S3 is ambiguous with probability between 0.3 and 0.7.

PART C — surface it.
  - src/eval/metrics.ts: add `brierScore` (mean over spaces and ticks >= onset of
    (probability - truthBurning)^2) and per-space `falsePositiveRate` / `falseNegativeRate`
    at probability >= 0.5, for both brains. Brier is the calibration number: a brain that
    says 0.5 when it is right half the time scores better than one that says 0.97 and is
    wrong. Add these to the evidence table and to results/evidence-cp2.json.
  - `npm run viewer` regenerates results/viewer-freeze.html; confirm the cells show
    "P(burning) NN%".
  - docs/decisions.md: one row for this change with the before/after numbers.

TESTS: src/brain/probability.test.ts. Hand-built observations. (1) Two equally good
hypotheses {A} and {B}: probability[A] and probability[B] both ~0.5. (2) One hypothesis:
its spaces ~1.0 (before the stability cap), others 0. (3) A space with a suspect sensor
gets a lower probability than the same space with a trusted sensor, same readings. (4) A
space reading 700° from a trusted sensor for 3 ticks is in burningSet. (5) Every
probability in [0,1]; sum of probabilities is not constrained.

DO NOT TOUCH: src/world, src/ui (except nothing — the split view already handles it),
src/corruption, src/brain/kalman.ts beyond the probability field.

Report the new evidence table. If falseCertainty for ours rises above 0 or Kalman's Brier
beats ours on any mode, stop and say so rather than tuning; a human decides.
```
