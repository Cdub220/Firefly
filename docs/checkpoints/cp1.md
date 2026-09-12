# Checkpoint 1 · hour 12 · Sun Sept 13, 12:00 AM ET · "The question"

Code as submitted: `50315d2` on `main`. Tag `cp1` marks the commit that adds this document. Repo: https://github.com/Cdub220/Firefly

## What exists now

- **A fire that spreads.** `npm run sim` on `data/structures/demo-6.json`: truth goes `[S3]` → `[S3,S4]` (t=15) → all six spaces by t=30; S3 burns out at t=34. Heat moves along plan edges at each edge's own rate, closed doors leak at 0.2×, spaces ignite above 250 °C, fuel burns down, hazards and door failures apply. `src/world/physics.ts`, 22 tests.
- **Drones that act and die.** BFS movement around lethal spaces, tether suppression, retardant coating, hatch door-closing, resupply, death above 400 °C. `src/world/drones.ts`, 20 tests.
- **A corruption model** with five modes (freeze, blind, saturate, flashover, mixed), persistent per-sensor state, and a written failure model in `README.md`. `src/corruption/`, 228-line test file. The estimator never sees which sensor is corrupted.
- **Two brains on identical observations.** A competent Kalman baseline (graph Laplacian from plan edges as process model, `src/brain/kalman.ts`) and our brain v0.1 (distrusts stale, stuck, and physically implausible sensors). `runLoopMulti` in `src/loop.ts` feeds both the same corrupted stream.
- **The brain provably cannot see truth.** `src/brain` cannot import `world`, `corruption`, `eval`, `ui`, or `loop` (lint rule + `src/arch.test.ts`); `Observation` carries no `burning` field (`src/loop.test.ts`).
- **Green:** `npm test` 88/88, `npm run lint`, `npm run typecheck`, `npm run build`. CI on every branch.

## The number

Freeze sensor S3 (the ignition space) at tick 5 and run 60 ticks, seed 42:

| | ours | Kalman |
|---|---|---|
| confidently wrong ticks (conf > 0.9) | **3** | **36** |
| mean abs temp error (°C) | 12.7 | 17.8 |

Reproduce: `npm run evidence` (table) and `npm run sim:freeze` (tick by tick). After the freeze, Kalman holds confidence 0.97 for the rest of the run while its burning set drifts from truth; ours drops to 0.44 and stays there.

## Video script, 60 seconds

**Beat 1, the question (0:00–0:15).**
When a building catches fire, the fire destroys the sensors that report it. Smoke makes them read cold. Heat saturates them. A room flashes over and every sensor in it dies at once. That's not noise. Noise averages out. This is corruption: readings wrong in structured, coordinated ways. And the textbook estimator doesn't get fuzzy under corruption. It gets confidently wrong.

**Beat 2, the evidence (0:15–0:50).**
*[Screen: `npm run sim:freeze` scrolling.]* This is a six-space structure. Fire starts in S3. At tick 5 we freeze S3's sensor: it keeps reporting the last value it saw, and it looks perfectly healthy. Left column is ground truth. Then a Kalman filter, the standard tool. Then ours. Watch the confidence. Kalman stays at 0.97 for the whole run while the fire moves on without it. Ours notices the sensor stopped changing, marks it suspect, and drops to 0.44. *[Screen: `npm run evidence`.]* Over sixty ticks: Kalman is confidently wrong on 36 ticks. Ours on 3. Same readings, same seed, same corruption. The estimator can't see which sensor is broken; it's lint-enforced that it can't. It has to figure that out from physics.

**Beat 3, what changed and what's next (0:50–1:00).**
What changed in our understanding today: the honest brain is not yet the *right* brain. Ours still lists a burned-out room as burning because it's hot. Next twelve hours: separate "hot here" from "burning here" using the structure's heat paths, and report ambiguity as a set of possible fires, not a point.

## Submission notes

- **Repo:** https://github.com/Cdub220/Firefly · commit `50315d2` · tag `cp1`
- **Run it:** `npm install && npm run evidence` (Node 22). `npm run sim:freeze` for the tick-by-tick view.
- **What changed since the start:** everything below the scaffold. World physics and drones (Chase). Corruption model, Kalman baseline, brain v0.1, two-brain loop, evidence script, failure-model writeup (Dean). Two contract edits, both additive: `CorruptionConfig` gained `k`, `onset`, `target`; `runLoop` gained a brain-factory parameter.
- **Failure model, stated:** a bounded number `k` of sensors can freeze (stale value that looks current), read blind (cold), saturate, or die together in a flashover; the subset is fixed after onset; the structure plan and conservation physics stay trusted. Full text in `README.md`.
- **Where feedback would help:** (1) Is "confidently wrong ticks at conf > 0.9" the right operationalisation of the brief's *false certainty*, or should it be calibration error? (2) Our Kalman baseline uses the plan's graph Laplacian as its process model; we want it to be strong, not a straw man. Would a judge consider it fair?
- **Known gaps, stated before you find them:**
  - Our brain v0.1 is honest about uncertainty but not yet accurate: at t=60 it lists all six spaces while truth has four. It also cannot yet tell "hot" from "burning", so a burned-out room stays in its set. That is checkpoint 2's work.
  - At ticks 5–7 both brains briefly list S2 (hot but not burning) before it ignites at t=8. Same "hot vs burning" gap.
  - One structure so far, one level. Multi-level with vertical conduction is checkpoint 2.
  - No UI. Terminal only, by design: the estimator beats the visuals through hour 36.
  - Two physics numbers deviate from our own plan (heat generation pulls toward a flame temperature instead of adding a constant; tethers survive to 900 °C). Both recorded with reasons in `docs/decisions.md`.

## Definition of done check (docs/04b, CP1)

| Item | Status | Evidence |
|---|---|---|
| `npm run sim:freeze` prints two-brain output where Kalman is confidently wrong on at least one tick and ours is not | **done** | t=20–60: Kalman c=0.97 with wrong set; ours c=0.44 |
| `npm run evidence` prints the count | **done** | ours 3, Kalman 36 |
| Chase's fire visibly spreads in the truth column | **done** | `npm run sim`: `[S3]` → six spaces by t=30 |
| Repo shows a clean architecture where the brain cannot see truth, lint-enforced and tested | **done** | `eslint.config.js` boundaries, `src/arch.test.ts` (5 tests), `src/loop.test.ts` |

## Rubric self-score

- **Innovation 7/10.** The insight (fire destroys its own sensors, correlated; textbook estimators go confidently wrong, not fuzzy) is sharp and the brief's own framing. We have shown it happening, not yet solved it. A 9 needs the ambiguity-set result.
- **Technical 7/10.** Real physics, real corruption model, a competent baseline, 88 tests, boundaries enforced by machinery, a two-agent write/verify loop that caught two real model defects. Brain v0.1 is thin.
- **Business Value 5/10.** The market story (ships, hangars, high-rises, warehouses, data centers) is in the docs but not in the artifact. Nothing on screen yet says why a fire chief would pay. Structure-as-data is the lever; a second plan file would prove it.
- **Presentation 6/10.** One clean number and a terminal that tells the story. No visuals. The script above is tight; delivery decides this one.
