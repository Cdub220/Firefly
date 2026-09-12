# Chase's prompts

Chase owns `src/world`, `src/ui`, `data/structures`, and shares `src/loop.ts` and `src/shared/types.ts` with Dean. The arc across five checkpoints:

| CP | Hour | Deliverable | Prompts |
|---|---|---|---|
| 1 | 12 | Fire physics: heat transfer on edges, ignition, fuel, drone effects, drone death, resupply. `npm run sim` shows the fire spreading. | [checkpoint-1.md](chase/checkpoint-1.md) |
| 2 | 24 | Multi-level structure plans with vertical conduction. First Three.js render of truth. | [checkpoint-2.md](chase/checkpoint-2.md) |
| 3 | 36 | Scenario picker over plan files. Chaos panel generated from `CorruptionConfig`. Play/pause/scrub. | [checkpoint-3.md](chase/checkpoint-3.md) |
| 4 | 48 | Drones and commands rendered. Truth / belief / diff split view with ambiguity and suspect sensors visible. | [checkpoint-4.md](chase/checkpoint-4.md) |
| 5 | 60 | Split-screen baseline vs ours. Containment counter. Demo polish and recording mode. Stretch: high-rise plan. | [checkpoint-5.md](chase/checkpoint-5.md) |

Order matters inside each file. Prompt 1 of the next checkpoint assumes every prompt of the previous one landed.

Things that stay true the whole time:

- The world never lies. It reports true temps at sensor locations plus tiny Gaussian noise. Every way a reading can be wrong lives in Dean's corruptor.
- Nothing in `src/ui` computes physics or belief. It reads `trace[cursor]` from the store.
- Nothing in `src/world` or `data/` names a ship. Space, level, structure plan. The high-rise at checkpoint 5 must be a new JSON file and zero code changes.
- All randomness through `rng.fork('world')`.
