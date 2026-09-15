# Firefly · Checkpoint 2 report

Sun Sept 13, 2026 · hour 24 · Dean Yao and Chase · Defense track
Repo: https://github.com/Cdub220/Firefly · branch `dean-branch` at the commit that adds this file. Companion piece: `estimator-math.pdf`.

**TL;DR**

- **Done.** A working estimator, a five-mode failure model, a Kalman baseline, a seven-metric eval harness with a 1,200-run sweep, three buildings as JSON, and a live page with a split view and a 3D scene. 237 tests.
- **Result.** On the same corrupted readings, the Kalman baseline is confidently wrong on 64 to 91 percent of ticks. Ours: 0 percent, in every failure mode, placement, and seed. It covers the true fire 93 percent of the time with a temperature error of about 5 °C against Kalman's 45 to 123 °C.
- **Why.** Kalman assumes every sensor is honest and averages. Ours assumes up to *k* are lying, checks each reading against the physics of the building, scores candidate fire patterns while discarding its worst misses, and reports every pattern that survives, not one winner.
- **Needs work.** Confidence climbs too slowly, temperature estimates drift where sensors have died, burned-out rooms still read as burning, and the six-room plan is too small to stress the set logic. The bigger buildings are next.
- **Next step.** Drones as sensors and the allocator brain. Drone readings already arrive alongside the fixed sensors but the estimator ignores them. The allocator will place each drone by containment value plus information value, so when the belief cannot separate two rooms, two scouts split to cover both and the first hot reading resolves it. Built after the method freeze at hour 36, because it consumes the belief rather than changing it.

---

**One sentence.** Firefly is the decision brain for a firefighting drone swarm inside a large enclosed structure, and the hard part is that the fire destroys the sensors that report it, so the brain has to decide which readings to believe before it decides where the fire is.

---

## 1. Progress: what exists now

Everything below runs offline, deterministically, from one seed. Nothing calls an API.

**The estimator, version 2.** It checks every reading against the physics of the building before using it, tests candidate fire patterns instead of averaging readings, and reports the set of patterns that survive rather than one winner. New since checkpoint 1: a per-space probability of burning, so "maybe" is graded instead of binary, and a rule that a sensor reading above ignition temperature for three straight ticks cannot be argued away. The math is in `estimator-math.pdf`.

**The failure model.** Five ways sensors lie, applied between the world and the brain: freeze (a sensor keeps reporting its last value with an old timestamp), blind (reads room temperature next to a fire), saturate (pins at a ceiling once hot), flashover (every sensor in a space over 500 °C dies at once, the correlated failure), and mixed (all of the above plus random comms loss). The brain never sees which one is active.

**The baseline.** A linear Kalman filter that knows the building's heat physics exactly and trusts every reading. It is competent, not a straw man. Same seeds, same readings, same physics as ours.

**The evaluation harness.** Seven metrics per run: false certainty, estimation error, time to recovery, compute cost (the four the brief names), plus wrong dispatch, ambiguity coverage, and Brier score. A sweep over every mode, three corruption budgets, four sensor placements, and ten seeds for both brains: 1,200 runs in 12 seconds.

**Buildings as data.** Three structure plans as JSON: a six-room ring, a three-deck vessel with 24 spaces, and a five-level tower. A generator produces new grids deterministically. Nothing in the code names a ship.

**The product.** One page, two views. The split view shows truth, our brain, and the Kalman baseline side by side on the same run, with five one-click demo beats and a per-tick strip showing when each brain was right, hedging, or confidently wrong. The 3D scene shows the fire climbing through the structure with a scenario picker and a chaos panel generated from the failure model's own type, so every knob we add appears without UI work.

**Engineering.** 237 tests, lint-enforced boundaries (the brain cannot import the world, the corruptor, or the evaluator), a two-agent write-then-verify loop on every change, CI on every branch.

---

## 2. The brain versus the baseline

### What is different

Both brains use the same heat model: heat flows between spaces along the doors, passages, bulkheads, and shafts in the plan, and a burning space pushes toward flame temperature. The difference is one assumption.

The Kalman filter assumes every reading is truth plus small noise. A sensor stuck at 555 °C is a perfectly plausible input to it, so it believes that room is burning forever, and its confidence comes from its own covariance, which only shrinks as readings arrive. It reports about 97 percent whether or not it is right.

Ours assumes up to *k* sensors may be lying and does not know which. It sets aside readings that contradict physics (a room cannot jump 400 degrees in one tick, cannot read cold between two burning neighbors, cannot carry a stale timestamp). It scores each candidate set of burning spaces by how badly its predicted temperatures miss the trusted readings, allowed to discard its *k* worst downward misses, because a broken sensor never reads hotter than the fire. It keeps every candidate within tolerance of the best and reports the intersection as burning, the rest as maybe with a probability. Confidence is one over the number of surviving explanations and is not allowed above 0.7 until the answer has held still for five ticks.

### The numbers

> **Correction, hour 18.** After an outside review we added a clean-run row, an innovation-gated Kalman, the filter's own posterior probabilities, and fixed the baseline's process model to match the world's. The Kalman's ~65 % "confidently wrong" turns out to be its **clean-run** number: with no corruption at all it names every space above 200 °C as burning, and 65 % of ticks (88 % on the vessel) have a hot space that is not burning. So that column measures **hot-versus-burning separation**, which ours does and a thermometer filter cannot. **Corruption resistance shows up in temperature error and coverage**: Kalman goes from 2 °C clean to 42 °C under freeze and 123 °C under blind, with 33 % coverage under blind; ours stays at 0.4 to 5 °C. Gating does not help the baseline (62–69 %). Full detail in `decisions.md`, hour 18, and the current table from `npm run evidence`.


Six-room plan, 60 ticks, sensors break at tick 5, five seeds each.

| Failure | Brain | Confidently wrong | Covers the true fire | Temp error | Brier |
|---|---|---|---|---|---|
| freeze | ours | **0%** | 93% | 4.9 °C | 0.067 |
| freeze | Kalman | 65% | 100% | 44.8 °C | 0.123 |
| blind | ours | **0%** | 93% | 5.1 °C | 0.069 |
| blind | Kalman | 72% | 33% | 122.7 °C | 0.181 |
| flashover | ours | **0%** | 93% | 10.9 °C | 0.078 |
| flashover | Kalman | 64% | 100% | 44.7 °C | 0.117 |

Confidently wrong means the burning set was wrong while confidence was 0.9 or higher. Brier is the mean squared error of the per-space probabilities, lower is better. Kalman's 100 percent coverage on freeze and flashover is because it lists too many spaces, which its temperature error shows.

The wider sweep (five modes, k of 1 to 3, four sensor placements, ten seeds, 120 ticks) tells the same story: ours is confidently wrong on 0 percent of ticks in every cell; Kalman on 64 to 91 percent. Ours recovered the true fire in all 600 runs; Kalman never recovered in 109 of its 600. Compute cost is about a tenth of a millisecond per tick for ours.

### What is good

- It is never confidently wrong, across every failure mode, placement, and seed we have tried. That is the thesis, and it held.
- The probabilities are calibrated enough to act on: Brier about half of Kalman's.
- It recovers every time, and it is cheap.
- Nothing in it is specific to a building. The same brain ran on all three plans.

### What needs work, stated before you find it

- **Confidence is low, not just honest.** The first-five-ticks cap is a caution rule, not a belief. It takes 30 to 56 ticks to reach high confidence in the sweep, where Kalman takes about 12 when it recovers at all. On the six-room plan the surviving set is right and small long before the confidence number says so. The per-space probability is the better number for a commander; the confidence number needs recalibrating or replacing before the freeze.
- **Temperature estimates degrade when sensors die.** Under saturate, flashover, and mixed, the mean temperature error is 79 to 104 °C, against 3 to 5 °C under freeze and blind. The burning set stays honest, but the temperature of a space with no live sensor is a physics rollout, and it drifts.
- **False positives after burnout.** At P ≥ 0.5, 14 to 25 percent of space-ticks are flagged burning when they are not, mostly spaces that have burned out but are still hot. A fuel budget limits this; it does not remove it.
- **Total blackout picks "no fire."** With zero trusted readings the tie-break favors the hypothesis that needs no liars, and everything shows as maybe at confidence 0.05. Honest, but not useful.
- **Six rooms is too small to show the interesting behavior.** With one sensor per space the surviving set is rarely larger than two or three, and raising *k* changed nothing. The sweep has only run on the six-room plan so far. On the 24-space vessel we have seen the belief collapse to one space while many burn; the next sweep quantifies that.

---

## 3. How we simulate

**The world.** Each structure is a graph. Spaces are nodes with a temperature, a fuel load, and an optional hazard. Edges are doors, passages, bulkheads, shafts, and floors, each with a heat-transfer rate from the plan file. One tick updates every space: heat moves along edges in proportion to the temperature difference and the edge rate, every space loses a little to the outside, and a burning space with fuel is pulled toward 900 °C. A space ignites when it passes 250 °C with fuel left; fuel burns down and the fire goes out when it is gone. Doors can fail shut. Ordnance cooks off. Fixed sensors report their space's temperature plus half a degree of noise, and that noise is the only thing the world ever gets wrong. Drones move one space per tick on the brain's commands, die above 400 °C unless tethered to a standpipe, and a tethered unit suppresses and cools the space it works.

**The lie.** A separate corruption layer sits between the world and the brain. It sees the clean readings and rewrites them according to the active mode. Flashover keys off the true temperature so that the fire kills sensors exactly where they matter most. The corruptor cannot import the world and the brain cannot import the corruptor; a test fails if either boundary is crossed.

**The brains.** Each brain receives the same corrupted readings and the same drone self-reports, and the plan file, and nothing else. It returns an estimate, a burning set, ambiguous groups, suspect sensors, a confidence, and a per-space probability. The primary brain's commands drive the drones in the world.

**Determinism.** One seed forks into separate random streams for the world, the corruptor, and each brain, so adding a random draw in one does not shift the others, and any run can be replayed exactly from its seed. A tick is one update cycle; we have not pinned it to wall-clock time, and the writeup will say so.

**The evaluation.** Ground truth is known because we simulate. Every metric is computed from tick of onset onward, and the cases in the final evaluation will be chosen after the method freezes at hour 36.

---

## 4. What is next

**Hours 24 to 36: the sweep on every building, then the freeze.** The sweep runs on the vessel and the tower, the "where ours loses" cases are diagnosed, and one estimator change is made if the sweep earns it. Then the method freezes: the commit hash, the exact failure model, and a test that fails if the estimator changes afterward. Every number after that is on cases chosen after the freeze.

**Hours 36 to 48: drones as sensors, and the allocator.** Today the brain ignores the drones. Their temperature readings already arrive in the same observation as the fixed sensors, tagged by source, and the world already moves and kills them; the estimator simply does not use them yet, and nothing decides where they go. The allocator changes both. It scores every possible drone placement by containment value (how much fire it stops) plus information value (how much ambiguity it removes), and picks jointly. The visible behavior: when the belief cannot separate two spaces, two scouts peel off toward each, and whichever one reads hot collapses the ambiguity. Drone readings then enter the estimator as one more trusted-or-suspect source, subject to the same physics checks, with comms loss and death already in the failure model. This is the half of the thesis that turns an honest "maybe" into an action, and it is built after the freeze on purpose: the allocator consumes the belief, it does not change how the belief is formed.

**Hours 48 to 60: the negative result.** A specific pair of fire states that our sensor layout provably cannot distinguish, what it costs in drone-ticks to hedge across both, and the one extra observation that resolves it. The brief says this is the strongest kind of result, and it is the one we are protecting time for.

**Where feedback would help.** Whether the confidence number should be replaced entirely by the per-space probabilities for the commander's display, and whether coverage should be scored against set size, since a brain that hedges on everything covers everything.
