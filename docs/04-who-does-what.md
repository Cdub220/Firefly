# Who does what, how, and how it fits together

For Dean, Chase, and every coding agent working in this repo. Read `docs/00-README.md` first for what we are building and why. This doc is about *how the work is split* and *how the two halves meet*.

---

## 1. The seam

There is exactly one seam between Dean's work and Chase's work, and it is the contract in `src/shared/types.ts`. Everything either person builds is on one side of it.

```
          CHASE                                DEAN
  ┌───────────────────┐               ┌──────────────────────┐
  │  src/world        │  Observation  │  src/corruption      │
  │  (structure+fire) │──────────────▶│  (failure model)     │
  │                   │               └──────────┬───────────┘
  │                   │  truth                   │ Observation'
  │                   │──────┐                   ▼
  └───────────────────┘      │        ┌──────────────────────┐
                             │        │  src/brain           │
  ┌───────────────────┐      │        │  (estimator +        │
  │  src/ui           │◀─────┤        │   allocator)         │
  │  (render, scrub,  │      │        └──────────┬───────────┘
  │   chaos panel)    │◀─────│─── belief, commands
  └───────────────────┘      │                   │
                             ▼                   ▼
                     ┌──────────────────────────────────┐
                     │  src/eval  (Dean)                 │
                     │  truth vs belief -> four metrics  │
                     └──────────────────────────────────┘

  src/loop.ts (shared) is the only file where world, corruption and brain meet.
```

The rules that keep this seam clean are lint-enforced (`eslint.config.js`) and tested (`src/arch.test.ts`):

- `src/brain` cannot import `world`, `corruption`, `eval`, `ui`, or `loop`. The brain sees only `Observation`.
- `src/corruption` cannot import `world` or `brain`.
- `src/world` cannot import `brain` or `corruption`.
- No `Math.random` anywhere. All randomness goes through `makeRng(seed)` and the per-subsystem forks (`rng.fork('world')`, `rng.fork('corruption')`, `rng.fork('brain')`), so adding a draw in one subsystem does not shift the others.

### Who owns which failure

This is the decision most likely to cause a collision, so it is written down:

| Thing that can go wrong | Owner | Where |
|---|---|---|
| Fire spreads, fuel burns down, temps rise, doors change | Chase | `src/world` |
| A drone physically dies in a hot space (`Drone.alive = false`) | Chase | `src/world` |
| A drone runs out of resource, refills at a resupply point | Chase | `src/world` |
| A sensor reads cold because of smoke, saturates from heat, freezes at its last value, or dies | **Dean** | `src/corruption` |
| Every sensor in a space dies together when it flashes over | **Dean** | `src/corruption` |
| A drone loses comms (`Drone.linked = false`, or its self-report goes stale) | **Dean** | `src/corruption` |

**The world never lies.** It reports the true temperature at every sensor location plus a tiny Gaussian noise. Every way a reading can be *wrong* belongs to corruption. The corruptor sees the clean observation, so it can key its failures off true temperatures (a sensor in a 600C space dies) without importing anything from the world.

---

## 2. Dean: corruption, brain, eval

### 2a. Failure model — `src/corruption/`

**What.** Define the class of measurement and communication failures precisely enough to analyze, and implement it as `Corruptor.apply(obs) -> obs'`.

**How.**
1. Extend `CorruptionConfig` in `src/shared/types.ts` (this is a contract edit, so tell Chase, but it is additive and expected). Something like:
   ```ts
   type CorruptionConfig = {
     seed: number;
     mode: 'none' | 'blind' | 'saturate' | 'freeze' | 'flashover' | 'mixed';
     k?: number;            // max corrupted sensors at once
     onset?: number;        // tick failures begin
     target?: SpaceId[];    // where, if fixed; omit for random
   };
   ```
   Every parameter Chase's chaos panel needs to expose must be a field on this type. That type *is* the chaos panel's API.
2. Implement each mode in `src/corruption/index.ts`. Use `rng.fork('corruption')` for every draw.
3. Write the "Failure model" section of `README.md`: what can fail, fixed or changing subset, bounded or arbitrary magnitude, how failures correlate, what stays trusted (the structure plan and conservation physics).
4. Test: `src/corruption/*.test.ts`. At minimum, for each mode, assert the corrupted observation differs from the clean one in the intended way and nowhere else, and that seed 42 twice gives identical corruption.

**Done when** the chaos panel can select a mode and see the brain's belief diverge from truth.

### 2b. Estimator — `src/brain/`

**What.** `Brain.step(obs) -> { belief, commands }`. Belief is a set, not a point.

**How.**
1. Build the Kalman baseline first, as a *separate* brain (`src/brain/kalman.ts`, exported as `createKalmanBrain`). It must be competent, not a straw man. It gets the same plan and the same seed.
2. Build the real estimator in `src/brain/index.ts`:
   - Physical consistency check: using `edgeMap(plan)` from `src/shared/plan.ts`, a reading that implies heat with no heat path from any plausible source is flagged into `belief.suspectSensors`.
   - Separate "hot here" from "burning here": estimate temp per space, then infer the burning set from temps plus edges and rates.
   - Ambiguity: when two burning sets explain the surviving readings equally well, put both in `belief.ambiguous` and lower `confidence`.
3. Make `runLoop` in `src/loop.ts` accept a brain factory so the eval harness can run both brains on identical observation streams. This is a small shared-file edit; tell Chase.
4. Test: the brain must never touch truth. `src/loop.test.ts` already asserts the observation has no `burning` field. Add estimator tests that construct `Observation` objects by hand.

**Done when** false certainty on one corruption case is lower than the baseline's, with a number.

### 2c. Eval harness and metrics — `src/eval/`

**What.** The four metrics from the Defense brief, swept over corruption location, correlation structure, and k, for both brains, on identical seeds.

**How.**
1. Finish `computeMetrics` in `src/eval/metrics.ts`: time to recovery (ticks from corruption onset until `burningSet` matches truth again) and compute cost (wrap `brain.step` with `performance.now()` in the loop).
2. `src/eval/index.ts` becomes a sweep: for each mode, k, onset, seed, run both brains and emit one row. Output a table to stdout and a JSON file to `results/`.
3. **Freeze at hour 36 (Mon 12:00 AM ET).** Commit, record the hash in `README.md` under "Method freeze", and after that only *add eval cases*, never touch `src/brain`.

**Done when** `npx tsx src/eval/index.ts` prints the head-to-head table.

### 2d. Allocator — `src/brain/`

**What.** `commands` that treat each drone as both a suppression asset and a sensor.

**How.**
1. Score each candidate `(drone, space)` by containment value plus information value (how much sending a sensor there would shrink `belief.ambiguous`).
2. When the belief is ambiguous, *split* units across the candidates. That is the visible behavior for check-in 4.
3. The brain knows where drones are only from `obs.drones` (self-reports, which corruption may stale). Never assume a command was obeyed; wait for the next report.

### 2e. Identifiability result — `docs/` and `src/eval/`

**What.** One specific pair of fire states that the sensor set provably cannot distinguish under the stated failure model, the operational cost of that ambiguity, and the one extra observation that resolves it.

**How.** Construct it on a small plan (`data/structures/`), show both brains fail on it, then add the resolving sensor or drone observation and show recovery. Write it up in `docs/05-identifiability.md`. This is the strongest single moment of the event. Protect the time.

---

## 3. Chase: world, ui, structure plans

### 3a. Fire physics — `src/world/`

**What.** Replace the `advancePhysics` stub so a fire actually spreads and a suppression command actually does something.

**How.**
1. Heat transfer along every edge: `dT = rate * (T_neighbor - T_self)`, using each edge's own `rate`. Closed bulkheads have low rates, open doors high, `floor` edges give vertical conduction. Do not hardcode a mechanism. The plan file decides.
2. Ignition: a space with `fuel > 0` ignites above a threshold temp. Burning spaces generate heat and consume fuel. Fuel at zero: burning stops, temp decays.
3. Commands: `tether` in a burning space reduces its heat generation; `retardant` in an unburned space reduces its fuel and costs resource; `hatch` closes a door (edit `doorsOpen`, which should lower that edge's effective rate); `scout` does nothing but be a sensor.
4. Drones die when `temp` in their space exceeds a threshold. Set `alive = false`, keep reporting nothing.
5. Every random draw through `rng` (already forked as `'world'`).
6. Test: `src/world/*.test.ts`. Fire on one side of a closed bulkhead reaches the other side later than through an open door. Seed determinism.

**Done when** `npm run sim` shows the burning set growing over 50 ticks.

### 3b. Multi-level plans — `data/structures/`

**What.** A plan with several levels and vertical coupling for check-in 2, and (stretch) a high-rise plan for check-in 5.

**How.** JSON only. `floor` edges between vertically adjacent spaces. For the high-rise, add a `shaft` edge chain with high rates to represent a stairwell. Validate with `validatePlan`. If a new field is needed (a `smoke` value, a `window` flag), that is a contract edit; propose it, do not sneak it in.

### 3c. Render — `src/ui/`

**What.** The truth/belief/diff split view, drone rendering, scenario picker, chaos panel, split-screen baseline, containment counter.

**How.**
1. All state flows through `useSim` in `src/ui/store.ts`. The store calls `runLoop` and holds the trace. Components read `trace[cursor]`, which has `truth`, `obs`, `belief`, `commands` for that tick. Nothing in `src/ui` computes physics or belief.
2. Scene: `@react-three/fiber` is installed. Lay out spaces by `level` and adjacency (procedural geometry, no Blender). Color by truth temp on the left, belief temp on the right, and highlight `belief.ambiguous` groups and `belief.suspectSensors`.
3. Chaos panel: render controls from `CorruptionConfig`. Whatever fields Dean adds to that type are the knobs. Pass the config to `runLoop`.
4. Scenario picker: list `data/structures/*.json`, load one into `runLoop`.
5. Split-screen baseline: run `runLoop` twice with the two brain factories, show both beliefs beside one truth.
6. Containment counter: count spaces burning in truth over time, for both brains.
7. Test: keep UI tests light. Store logic (`run`, `setCursor`) is testable under vitest without a DOM.

**Done when** a judge can pick a scenario, pick a corruption, press run, and watch the two beliefs diverge from truth.

---

## 4. How it fits together, by checkpoint

| Hour | Chase delivers | Dean delivers | Integration point |
|---|---|---|---|
| 12 · Sun 12 AM | Fire spreads on one level. `npm run sim` shows growth. | Corruption modes + Kalman baseline + estimator v0. | `runLoop` runs both brains; sim prints both beliefs. |
| 24 · Sun 12 PM | Multi-level plan with vertical conduction. First render. | Consistency check, ambiguity sets. | UI shows `belief.ambiguous`. Video shows one false-certainty number vs baseline. |
| 36 · Mon 12 AM | Scenario picker, chaos panel wired to `CorruptionConfig`. | Eval harness, four metrics. **Freeze.** | Chaos panel and eval harness read the same config type. |
| 48 · Mon 12 PM | Drone rendering, truth/belief/diff split view. | Allocator with hedging. | UI shows commands splitting units across ambiguous spaces. |
| 60 · Tue 12 AM | Split-screen baseline, containment counter, polish. Stretch: high-rise plan. | Identifiability result, briefings. | Same brain, second plan file, nothing retrained. |
| 72 · Tue 12 PM | Rehearsal, backup recording. | README, writeup. | Final demo has no live API calls. |

---

## 5. Rules of engagement

**Contract changes.** `src/shared/types.ts` is edited only with the other person's agreement. Additive changes (a new optional field, a new union member) need a heads-up in chat. Breaking changes (renaming, removing, changing a signature) need a yes before the commit. Same for `src/loop.ts`.

**Before every push:** `npm test && npm run lint && npm run typecheck`. All three green. The arch test fails the build if the brain reaches for truth, on purpose.

**Branching.** Each person works on their own branch: `dean-branch` and `chase-branch`, both cut from `main`. Commit small. Push your branch after every prompt lands. Merge to `main` at least at every checkpoint, and any time the other person needs what you built (a new plan file, a new `CorruptionConfig` field, a `runLoopMulti`). Before merging to `main`: `git pull origin main` into your branch first, run the checks, then merge with `--no-ff` so the history shows the unit of work. The directory boundaries mean the merge is almost always clean; when it is not, it is `package.json`, `types.ts`, or `loop.ts`, and you already talked. `main` must always be green: it is what a judge clones and what `/checkpoint` tags.

```bash
git checkout dean-branch && git pull origin main      # take Chase's work
npm test && npm run lint && npm run typecheck         # still green?
git checkout main && git pull && git merge --no-ff dean-branch && git push
git checkout dean-branch
```

**When you need something from the other side.** Ask for it in terms of the contract. "I need `Observation` to carry X" or "I need `runLoop` to accept Y," not "change your code." Stub it yourself behind the interface if you are blocked, and leave a `TODO(Chase)` or `TODO(Dean)`.

**Freeze.** After hour 36 (Mon 12:00 AM ET) nobody touches `src/brain/index.ts` or `src/corruption/` logic. Eval cases, plans, UI, allocator wiring, and docs are fine. If a bug forces a change, record the second hash and say so in the writeup.

**Cut list.** In `docs/00-README.md`. Cut from the top. Never cut the estimator, corruption model, baseline, eval harness, one identifiability result, or the checkpoint videos.
