# Decisions log

Choices made during the event that are not derivable from the code. Newest at the bottom. Add to this when you make a call the other person or a future agent would otherwise have to rediscover.

| When | Decision | Why |
|---|---|---|
| Sat hour 0 | Repo is a single Vite + React + TS package, no workspaces. Zustand, Tailwind v4, vitest, tsx, eslint flat config. | Speed. Boundaries are enforced by lint, not by package layout. |
| Sat hour 0 | React pinned to 19.2.x. | `@react-three/fiber` 9.x refuses React 19.3. |
| Sat hour 0 | Five contract edits to the original scaffold prompt: `Reading` has `sensorId` and `source`; `StructurePlan` with per-edge rates exists; brain takes an `Observation` bundle (readings + drone self-reports) not bare readings; a `Corruptor` interface exists; `Belief` has `suspectSensors`. | Fixed hardwired sensors are the trusted reference in the plan. Edge rates must be data. The brain cannot allocate drones it cannot locate. The corruption directory needed a contract. The UI needs to show distrusted sensors. |
| Sat hour 0 | Adjacency is derived from edges at load time. Plan JSON has `spaces` and `edges`, not `neighbors`. | One source of truth; no inconsistency between a neighbor list and an edge list. |
| Sat hour 0 | RNG streams are forked per subsystem: `rng.fork('world')`, `'corruption'`, `'brain'`. | Adding a draw in one subsystem must not shift the others, or seed-matched comparisons break. |
| Sat hour 0 | The world never lies. Every way a reading can be wrong, including sensor death from heat and drone comms loss, lives in `src/corruption`. The world owns physical drone death and fire physics. | One place to state the failure model for the writeup. The corruptor sees clean temps so it can key correlated failures off them without importing the world. |
| Sat hour 0 | `CorruptionConfig` is the chaos panel's API. Dean adds fields; Chase's panel is generated from a schema with a compile-time exhaustiveness check. | Neither person edits the other's directory when a knob is added. |
| Sat hour 0 | Brain also cannot import `src/corruption`, `src/eval`, `src/ui`, or `src/loop`, not just `src/world`. | Importing the injector would leak the failure pattern. |
| Sat hour 2 | Checkpoints are every 12 hours (hours 12/24/36/48/60), final at 72 (Tue noon ET, assumed from the Playbook). The pitch doc's 8-hour cadence is superseded. | Organizer confirmation relayed by Dean. |
| Sat hour 2 | Method freeze moves from hour 24 to hour 36 (CP3, Sunday midnight ET). | Keeps freeze at checkpoint 3 under the new cadence. Gives the estimator 12 more hours; still leaves 36 hours of post-freeze evaluation. |
| Sat hour 2 | After the freeze, new brain code (allocator, briefings) goes through `src/brain/commands.ts`, an unfrozen hook file, so frozen files change by one import and one line. | The freeze test diffs frozen files against the recorded hash. |
| Sat hour 2 | Kalman baseline uses the graph Laplacian from plan edges as its process model. | It must be competent, not a straw man, or the comparison is worthless. |
| Sat hour 2 | Estimator design: hypothesis sets over candidate burning sets, physics-predicted temps, drop the k largest residuals, keep every hypothesis within tolerance of the best. Confidence = 1 / kept hypotheses × consistency penalty. | Direct implementation of the brief's y = Hx + a sparse-corruption framing; produces honest ambiguity as a set rather than a point. |
| Sat hour 2 | Docs `05` to `09` are reserved for artifacts produced during the event: identifiability, freeze, what-surprised-us, writeup, generality. | The prompts reference them by name. |
