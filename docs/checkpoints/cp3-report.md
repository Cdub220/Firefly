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

## 2. The numbers

### Open loop: what each brain believes

Six-room plan, 60 ticks, sensors break at tick 5, five seeds. `npm run evidence`. The clean row is first on purpose.

| Failure | Brain | Confidently wrong | At P ≥ 0.9 | Covers the fire | Temp error | Brier |
|---|---|---|---|---|---|---|
| none | ours | **0%** | 1% | 95% | 0.4 °C | 0.043 |
| none | Kalman naive | 65% | 63% | 100% | 2.2 °C | 0.130 |
| none | Kalman gated | 67% | 67% | 100% | 18.7 °C | 0.139 |
| none | Kalman source | 14% | 5% | 94% | 0.9 °C | 0.028 |
| freeze | ours | **0%** | 0% | 93% | 4.9 °C | 0.067 |
| freeze | Kalman naive | 65% | 63% | 100% | 42.3 °C | 0.129 |
| freeze | Kalman gated | 62% | 66% | 100% | 37.4 °C | 0.136 |
| freeze | Kalman source | 59% | 25% | 46% | 44.8 °C | 0.139 |
| blind | ours | **0%** | 1% | 92% | 5.1 °C | 0.069 |
| blind | Kalman naive | 72% | 35% | 33% | 122.6 °C | 0.184 |
| blind | Kalman gated | 69% | 58% | 78% | 91.3 °C | 0.149 |
| blind | Kalman source | 73% | 34% | 33% | 123.3 °C | 0.187 |
| flashover | ours | **0%** | 0% | 93% | 10.9 °C | 0.078 |
| flashover | Kalman naive | 64% | 63% | 100% | 12.9 °C | 0.130 |
| flashover | Kalman gated | 62% | 67% | 100% | 23.2 °C | 0.138 |
| flashover | Kalman source | 2% | 48% | 24% | 151.9 °C | 0.447 |

How to read it. The naive and gated filters are "confidently wrong" 65 % of the time with honest sensors, because they call any room above 200 °C burning and burned-out rooms stay hot. The source filter fixes that, 14 % on a clean run, and is the best-calibrated brain when nothing lies. Then corruption hits, and it is fooled as badly as the others under freeze and blind; under flashover it stops being confidently wrong only because it loses the fire, covering it a quarter of the time. Ours is the only brain whose numbers do not move when the sensors start lying.

### The full sweep

Three buildings, five failure modes, three corruption budgets, four placements, ten seeds, 120 ticks, four brains: 5,400 runs. No cell where ours is worse than the best baseline on false certainty or wrong dispatch. Per building, averaged over everything:

| Building | Ours: confidently wrong / at P ≥ 0.9 | Best baseline: confidently wrong |
|---|---|---|
| demo-6 (6 rooms) | 0% / 7% | 63% |
| vessel-3x8 (24, 3 decks) | 0% / 10% | 87% |
| tower-5x4 (20, 5 levels) | 0% / 7% | 76% |

The 7 to 10 % at P ≥ 0.9 comes from random-placement flashover and mixed cells, where a burned-out room beside a live fire is held above 0.9. The freeze record names the worst cells.

### Closed loop: what each belief costs

The demo run. Vessel, fire in L1-B3, its sensor blinded from tick 1, seed 42, 90 ticks, same allocator and drones on every side. From `results/showdown-vessel-blind-t1-seed42.md`:

```
brain            fireVolume  peakBurning  containedAt  extinguishedAt  spacesBurnedOut  tetherTicks  droneDeaths  wrongFloor
ours                     33            1            1              34                1           68            0          74
kalman                 1133           22           35              85               23          147            4          23
kalman-source          1183           23           35              85               24           54            4          22
```

Ours' wrong-floor count is higher because in the first three ticks it sent scouts and tethers to rooms it could not yet rule out. Those are investigations, not mistakes, and they are why it found the fire by tick 4. Splitting that metric by drone class is on the list.

The decision transcript, ours, first ticks:

```
t=1  Cannot tell whether L1-A2, L1-A4, L1-B3 and 1 more are burning or just hot (L1-A2 19%, L1-A4 19%, L1-B3 19%, L2-A3 19%).
t=1  No trusted reading from L2-B3: sending 1 scout (D1) to L2-B3 to look.
t=1  L1-A3 on fire (48%): sending 2 water tethers (D3, D4) to L1-A3 to cool it.
t=2  L1-B3 may be burning (26%): sending 1 water tether (D4) to L1-B3 to cool it.
t=4  Believes L1-B3 burning (L1-B3 90%; confidence 0.58).
t=4  L1-B3 on fire (90%): sending 2 water tethers (D3, D4) to L1-B3 to cool it.
t=8  Distrusts sensor F-L1-B3: the reading contradicts the physics of the building.
```

And the Kalman's, in full for its first ten ticks:

```
t=1  No fire detected yet (confidence 0.96).
t=6  Believes L1-A3, L1-B4 burning (L1-A3 100%, L1-B4 98%; confidence 0.96).
t=6  L1-A3 on fire (100%): sending 1 water tether (D3) to L1-A3 to cool it.
t=6  L1-B4 on fire (98%): sending 1 water tether (D4) to L1-B4 to cool it.
t=10 Believes L1-A3, L1-B2, L1-B4 burning (L1-A3 100%, L1-B2 90%, L1-B4 100%; confidence 0.96).
```

It never names L1-B3, the room that is burning, because that room reads cold.

### The negative result

`npm run ident`. A central passage with three sensors and two mirror-image wings whose inner rooms have none. A fire in the left inner room and one in the right produce readings that differ by 0.0 °C at every sensor. No estimator can distinguish them; swapping the wings is a symmetry of the plan. Ours lists both wings as ambiguous and covers the true fire 93 % of the time; the naive Kalman covers it 18 % and is falsely certain on 40 % of ticks by the probability definition. Add one sensor in the inner room and the two hypotheses separate by 548 °C. Details and diagram in `docs/05-identifiability.md`.

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
