# Dean's prompts

Dean owns `src/corruption`, `src/brain`, `src/eval`, and shares `src/loop.ts` and `src/shared/types.ts` with Chase. The arc across five checkpoints:

| CP | Hour | Deliverable | Prompts |
|---|---|---|---|
| 1 | 12 | Failure model with 4 modes. Kalman baseline. Loop runs two brains on the same observations. First "baseline goes confidently wrong" run. | [checkpoint-1.md](dean/checkpoint-1.md) |
| 2 | 24 | Hypothesis-set estimator: physical consistency check, `suspectSensors`, ambiguity as sets, honest confidence. One false-certainty number vs baseline. **Prompt 4: graded per-space probability, pre-freeze. Prompt 5: split view v2 for the CP2 demo video.** | [checkpoint-2.md](dean/checkpoint-2.md) |
| 3 | 36 | Eval harness: four metrics, sweep over mode × k × location × seed for both brains. Results table. **Freeze the method.** | [checkpoint-3.md](dean/checkpoint-3.md) |
| 4 | 48 | Allocator: containment + information value, hedging across ambiguous spaces. | [checkpoint-4.md](dean/checkpoint-4.md) |
| 5 | 60 | Identifiability result: a provably indistinguishable pair, its cost, the observation that resolves it. Templated briefings. Writeup skeleton. | [checkpoint-5.md](dean/checkpoint-5.md) |

Order matters inside each file. Prompt 1 of the next checkpoint assumes every prompt of the previous one landed.

Things that stay true the whole time:

- The brain sees `Observation` only. If you find yourself wanting truth inside `src/brain`, that is the eval harness's job, not the brain's.
- All randomness through `rng.fork('corruption')` or `rng.fork('brain')`.
- After hour 36 (Mon 12:00 AM ET), `src/brain/index.ts` and `src/corruption/` logic are frozen. Everything in checkpoint 4 and 5 is additive: new files, new eval cases, new plans.
