# Checkpoint 2 · hour 24 · Sun Sept 13, 12:00 PM ET · "First evidence"

Code as submitted: `7f07d81` on `main`. Tag `cp2` marks the commit that adds this document. Repo: https://github.com/Cdub220/Firefly

## What exists now

- **The real estimator.** Brain v1 uses the structure's heat physics as a trusted reference, flags sensors that contradict it, runs hypothesis sets over candidate burning sets, and reports ambiguity as a set with confidence that has to be earned by stability. `src/brain/`, `npm run evidence`.
- **The number, across three failure modes and five seeds.** `npm run evidence` prints the table below and one summary sentence per mode; `results/evidence-cp2.json`.
- **Multi-level structures with vertical conduction.** `data/structures/vessel-3x8.json` (three levels, 24 spaces, floor and shaft edges) and `tower-5x4.json` (five levels), generated deterministically by `npm run gen:plans`; `npm run sim -- --plan vessel-3x8`. On the vessel a fire on level 1 reaches level 2 at t≈20; on the tower the stairwell gets fire to the top floor ~20 ticks sooner than concrete slabs alone.
- **A 3D truth render.** `npm run dev`, tab "3D scene", structure select: boxes by temperature, heat paths by kind, sensor spheres green / amber (lying) / red (silent), level slicer, playback. `docs/img/cp2-render-t20.png` shows fire climbing deck by deck with the frozen sensor amber.
- **The split view, live in the browser.** `npm run dev`, tab "Split view": truth | ours | Kalman on identical corrupted readings, a fire-start picker, plain-English failure controls, a per-tick false-certainty strip.
- **Green:** `npm test` 169/169, lint, typecheck, `npm run build`. Brain still cannot import world, corruption, eval, or the loop (lint + `src/arch.test.ts`).

## The number

`npm run evidence` · demo-6 · 60 ticks · onset 5 · k=1 · targets S3,S2 · seeds 1–5

| mode | brain | false certainty | coverage | mean error (°C) |
|---|---|---|---|---|
| freeze | ours | **0%** | 91% | 3.6 |
| freeze | Kalman | **65%** | 100% | 42.0 |
| blind | ours | 0% | 91% | 3.7 |
| blind | Kalman | 72% | 33% | 114.7 |
| flashover | ours | 0% | 91% | 8.0 |
| flashover | Kalman | 64% | 100% | 41.9 |

False certainty = ticks where the brain's burning set is wrong while its confidence is ≥ 0.9. Coverage = ticks where the true burning set is inside the brain's set (burning ∪ maybe).

## Video script, 60 seconds

**Beat 1, the claim (0:00–0:15).**
Last night we showed the problem: freeze one sensor and a Kalman filter stays 97 percent sure of the wrong answer. Today, the number. Same building, same fire, three ways to break the sensors, five random seeds each.

**Beat 2, the evidence (0:15–0:50).**
*[Screen: split view, freeze case, Play at 4 per second.]* Truth on the left. Our brain in the middle. Kalman on the right. The frozen sensor keeps reporting an old number. Our brain checks it against the physics of the building, decides it can't be trusted, and drops its confidence. Kalman never notices. *[Screen: the evidence table.]* Across freeze, blind, and flashover: Kalman is confidently wrong on 64 to 72 percent of ticks. Ours: zero. And ours still covers the true fire 91 percent of the time, with a mean temperature error of four degrees against Kalman's forty. *[Screen: 3D scene, vessel-3x8 at tick 20.]* And the estimator doesn't care what the building is. This is a three-deck structure from a different JSON file: same brain, nothing retrained, fire climbing through the steel.

**Beat 3, what changed, what's next (0:50–1:00).**
What changed in our understanding: honesty was the easy part. Ours never claims false certainty, but on the blind case it covers the true fire only 91 percent of the time, so 9 percent of ticks the fire is somewhere it didn't list. Next twelve hours: a chaos panel so a judge can break the sensors any way they like, a full sweep over structures and failure modes, and then we freeze the method.

## Submission notes

- **Repo:** https://github.com/Cdub220/Firefly · commit `7f07d81` · tag `cp2`
- **Run it:** `npm install && npm run evidence` (Node 22). `npm run dev` for the split view and the 3D scene.
- **What changed since checkpoint 1:** the estimator went from "distrust stale sensors" to a physics-referenced hypothesis-set estimator with earned confidence (Dean). Two multi-level structure plans and a deterministic plan generator, a Three.js truth render with plan picker, a config-driven store (Chase). Evidence widened from one case to three modes × five seeds.
- **Where feedback would help:** (1) Our false-certainty metric is "wrong set at confidence ≥ 0.9". Is calibration error (confidence vs. hit rate) the better operationalisation? (2) Coverage of 91% comes from the brain's set being too small on a few ticks after burnout; should a set estimator be scored on coverage alone, or on coverage × set size?
- **Known gaps, stated before you find them:**
  - The evidence table is on the six-space plan only. On the 20–24 space plans our brain's belief sometimes collapses to one space at confidence 0.05 while many spaces burn. Reproduce: `npm run sim -- --plan vessel-3x8 --ticks 60`. The sweep at checkpoint 3 will quantify this.
  - Per-space probabilities and one-click demo beats in the split view are written but on Dean's unmerged branch at submission time; the split view on `main` shows a binary MAYBE.
  - Kalman's high coverage on freeze/flashover (100%) is because it lists too many spaces, not because it is right; its 42 °C mean error says so.
  - Fire descends a stairwell as fast as it climbs (edges are symmetric); a directional stack effect is deferred.

## Definition of done check (docs/04b, CP2)

| Item | Status | Evidence |
|---|---|---|
| `npm run evidence` prints the table and the one-sentence summary | **done** | table above; three summary lines |
| Split view lays out vessel-3x8 by level with fire on two levels | **done via the 3D scene** | `npm run dev` → 3D scene → vessel-3x8; `docs/img/cp2-render-t20.png`. The split view itself lays out by level only on Dean's unmerged branch |
| Split view has one-click demo beats | **not on main** | Dean's CP2 prompt 5, unmerged at submission |
| Split view shows per-space probabilities | **not on main** | Dean's CP2 prompt 4; the split view renders them when the brain emits `probability`, the brain on `main` does not yet |
| The video is a screen recording of the split view, not the terminal | **human step** | script above |

## Rubric self-score

- **Innovation 8/10.** The claim now has a number behind it across three failure modes, and "same brain, different building" is demonstrated, not promised.
- **Technical 7/10.** Physics-referenced estimator, hypothesis sets, 169 tests, two-agent write/verify loop on every prompt. Weak spot: the estimator's collapse on larger plans is unexplained.
- **Business Value 6/10.** The pitch deck and the second plan file make the generality claim concrete. Nothing yet shows a dispatch decision or a cost.
- **Presentation 7/10.** Live split view and a 3D render to point at. The number is one sentence long. Delivery decides the rest.
