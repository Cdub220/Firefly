# Firefly · Checkpoint 3 report

Sun Sept 13, 2026 · hour 36 · Dean Yao and Chase Williamson · Defense track
Repo: https://github.com/Cdub220/Firefly · everything below is on `main`. Companion pieces: `estimator-math.tex` (the brain, as frozen), `docs/06-freeze.md` (the freeze record), `docs/07-what-surprised-us.md`, `docs/05-identifiability.md`, `results/showdown-vessel-blind-t1-seed42.md` (the demo run's commander's brief and decision transcripts).

**TL;DR**

- **Frozen.** The estimator and the failure model are frozen at commit `457de46`, hour 36. A test fails the suite if a frozen file changes. The evaluation families for the rest of the event were written down before the freeze, with fresh seeds, and are committed unrun.
- **The loop runs both ways.** The belief now drives drones; drones cool rooms, strip fuel, close doors and carry sensors; what they see feeds back into the brain. Same allocator for every brain, so a comparison is two copies of the same ship with different beliefs in command.
- **The demo, one number.** Vessel, three decks, the sensor in the burning room blinded from tick 1. Ours: one compartment burned, fire out at tick 34, no drones lost. Kalman in command of the same ship: 23 of 24 compartments burned, four drones dead, out at tick 85 when the fuel ran out.
- **The baseline is fair now.** Three Kalman variants: naive, innovation-gated, and source-estimating. The gap survives all three. We found and fixed a straw man in our own baseline along the way and say so.
- **Honest limits.** By the strict definition ours is confidently wrong on 0 % of ticks in 5,400 runs. By the per-room probability definition it is 0 to 1 % on named targets and up to 49 % in the worst random-placement cell, where a burned-out room next to a live fire is held above 0.9. Pre-registered expectation not met; reported as such.
- **A negative result.** A seven-room building where two fires produce identical readings at every sensor, so no estimator can tell them apart. Ours says so; the baselines pick one. One added sensor separates them by 548 °C.

---

## 1. What changed since checkpoint 2

**The estimator, final and frozen.** Four additions, all before the freeze, all in `estimator-math.tex` page 1: blackout carries the last belief forward instead of reporting "no fire"; a room cannot be called 90 % likely until it has been in every surviving explanation for two ticks; drones are moving sensors and are judged against the room they are in; and the brain knows water exists, so a fire it is cooling no longer looks like a fire that went out. That last one mattered: before it, the belief flipped 14 to 36 times per run and the tethers followed the flip. After, zero.

**Three baselines instead of one.** An outside review pointed out that a Kalman filter without innovation gating is not what anyone deploys, and that we had hand-written the baseline's probabilities. We added gating, made the probability the filter's own posterior, and then found something worse: the baseline's process model had kept a constant heat source from the hour-5 world and no cooling. Fixed. We also built a source-estimating filter, the textbook way to separate hot from burning, because the naive filter's "confidently wrong" number turned out to be its clean-run number.

**Drones.** An allocator scores every drone against every candidate room by containment value plus information value, minus distance, assigns greedily with a diversity penalty so two scouts split across an ambiguous pair, and keeps drones from oscillating. Tethers suppress and cool, retardant strips fuel, the hatch drone closes doors, scouts and the relay carry sensors.

**The product.** A head-to-head view: Kalman's ship on the left, ours on the right, each brain commanding its own drones, one shared camera. A containment chart under them, spaces burning in each world over time. A scorecard. And a decision log per world: every belief change and every order in the brain's own words, with the reason, up to the current tick.

**The commander's brief.** `npm run brief` runs each brain closed-loop on the same seed and prints a play-by-play, the outcome numbers, and a side-by-side table. The head-to-head view renders the same information live.

**Engineering.** 347 tests, 39 files. Lint-enforced boundaries. The freeze test. CI checks out full history so the freeze test can diff against the hash.

---

## 2. The numbers, and how to see them yourself

Everything is deterministic from a seed and nothing calls a network. Clone `main`, run `npm install` (Node 22), and every command below prints exactly the numbers we quote, to the digit.

**What each brain believes, open loop.** `npm run evidence` prints the six-room table: four brains × four failure modes, clean row first. What you will see: the naive and gated Kalman filters are "confidently wrong" about 65 % of ticks even with honest sensors, because any room above 200 °C is "burning" to them and burned-out rooms stay hot; the source-estimating filter fixes that (14 % clean) and is then fooled as badly as the others once sensors lie (59 % freeze, 73 % blind), or loses the fire outright under flashover (24 % coverage). Ours is at 0 % in every row, covers the fire 92 to 95 %, and its temperature error stays under 11 °C where the baselines go to 40 to 150 °C. Below the table is the same comparison on per-room probability at thresholds 0.5 to 0.95.

**The full sweep.** `npm run sweep -- --plans demo-6,vessel-3x8,tower-5x4` (about four minutes) prints 5,400 runs aggregated by building, failure mode, corruption budget, and sensor placement, and ends with a WHERE OURS LOSES block. What you will see: the block is empty; there is no cell where ours is worse than the best baseline on false certainty or wrong dispatch. Also visible: ours' false certainty by probability at 0.9 is 7 to 10 % averaged per building, driven by random-placement flashover cells where a burned-out room beside a live fire is held above 0.9. `docs/06-freeze.md` names those cells; this is the pre-registered expectation we did not meet.

**The demo run, closed loop.** `npm run showdown` runs the exact case in the video: vessel-3x8, fire in L1-B3, its sensor blind from tick 1, seed 42, 90 ticks, each brain in command of its own copy of the ship with the same drones and the same allocator. What you will see: a side-by-side table where ours burns one compartment and puts it out at tick 34 with no drones lost, and both Kalmans burn 23 to 24 of 24 compartments, lose four drones, and are "out" at tick 85 only because the fuel is gone; then a commander's brief per brain with the play-by-play. The head-to-head tab in `npm run dev` shows the same run live: press **Showdown**, then Play. Our wrong-floor count in that table is higher than the Kalman's because in the first three ticks ours sent scouts and tethers to rooms it could not yet rule out; those are investigations, not mistakes, and they are why it finds the fire by tick 4. Splitting that metric by drone class is on the list.

**The decision transcript.** The same run's log, in the brain's own words, is under the scorecard on the head-to-head tab and in `results/showdown-vessel-blind-t1-seed42.md`. The shape of it: ours at tick 1 says it cannot tell which of four rooms is burning and sends a scout; at tick 4 it names L1-B3 at 90 % and sends two tethers; at tick 8 it stops trusting that room's sensor. The Kalman says "no fire detected" for five ticks, then names the neighbours, and never names the room that is burning, because that room reads cold.

**The negative result.** `npm run ident` prints the seven-room construction, the measurement vectors under both fires (identical to 0.0 °C at every sensor), the sentence that no estimator can distinguish them, what each brain does about it, and the one added sensor that separates them by 548 °C. `docs/05-identifiability.md` is the one-page version.

**The freeze.** `npm test` includes a test that diffs the estimator and corruption files against commit `457de46` and fails if they differ.

---

## 3. Screenshots

*(Insert here: the head-to-head view at tick 1 with the SHOWDOWN tag and the MISSED badge on the Kalman side; the same view at tick 60 with the containment chart; the decision logs; the split view freeze beat; the 3D scene on the vessel.)*

---

## 4. What surprised us

Condensed from `docs/07-what-surprised-us.md`, which is the CP3 video script.

1. **Our baseline's 65 % was a clean-run number.** It measured our label rule, not corruption. We would not have found this without an outside reader asking for a gated filter.
2. **Gating does not help.** A frozen sensor reporting a plausible value never trips a three-sigma gate, and a dead sensor produces nothing to reject.
3. **The source filter fixes the clean run and then loses the fire.** Separating hot from burning is necessary and not sufficient.
4. **The brain did not know water existed.** The first closed-loop run showed tethers arguing with their own belief. One rollout term fixed it, and the fix erased an advantage we had been reporting that was an artefact of the bug.
5. **Physics as a trusted reference survives a wrong plan.** Edge rates perturbed ±30 %: ours unchanged to 0.1 °C. ±50 % is a held-out family.

---

## 5. What is next

- The held-out families in `docs/06-freeze.md` section 2, on seeds 101 to 120, never run during development. The writeup's evidence section fills from them.
- Split the per-room false certainty into "hot but burned out" and "cold and wrong," and wrong-floor by drone class. Eval code, freeze-legal.
- The adversarial next test: corruption chosen by someone who has read the estimator. Described in the writeup, not built.
- The final video and writeup.
