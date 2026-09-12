# Chase · Checkpoint 3 · hour 24 · Sun 12:00 PM ET

**Goal.** A judge can pick a structure, pick a way to break the sensors, press run, and scrub. The chaos panel is generated from Dean's `CorruptionConfig` type so that every knob he adds appears without UI changes. Dean freezes his method at this hour; your panel is how he and the judges exercise it.

---

## Prompt 1 · Store and loop plumbing

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: src/ui/store.ts runs runLoop on "run" and holds the trace. Dean changed
src/loop.ts: LoopConfig now takes a full CorruptionConfig and an optional brain factory,
and there is runLoopMulti({ brains: {...} }) that feeds several brains one identical
observation stream. Read src/loop.ts and src/shared/types.ts for the exact shapes.
src/shared/structures.ts exports PLAN_NAMES and loadPlan(name).

TASK: rework the store so the UI drives everything through config, not hardcoded values.

src/ui/store.ts:
  state: planName, seed, ticks, corruption: CorruptionConfig, brains: 'ours' | 'both',
         traces: Record<string, TickRecord[]>, primary: string, cursor, playing, speed,
         error: string | null.
  actions: setPlan, setSeed, setTicks, setCorruption(partial), run(), play(), pause(),
           step(delta), setCursor, setSpeed.
  run(): builds LoopConfig from state, calls runLoopMulti with { ours: createBrain,
         kalman: createKalmanBrain } when brains === 'both' else just ours, stores traces,
         cursor 0, playing false. Wrap in try/catch and store an error string; never let
         a brain exception blank the screen.
  Selectors: useCurrent() returns traces[primary][cursor]; useCurrentFor(name).
  Persist planName/seed/corruption to localStorage under a versioned key, wrapped in
  try/catch; ignore if unavailable.

Keep the playback loop in one place: a usePlayback() hook that advances cursor at
speed ticks/sec with requestAnimationFrame while playing, and stops at the end.

TESTS: src/ui/store.test.ts (node environment, no DOM): run() populates traces with
ticks records; setCorruption merges; step clamps at bounds; a corruption mode of
'freeze' with k=1 yields at least one reading in the trace whose t lags obs.t (proves the
config actually reached the corruptor).

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/world, src/loop.ts (read only),
src/shared/types.ts.
```

---

## Prompt 2 · Scenario picker and chaos panel

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: the store exposes setPlan/setCorruption/run/play and traces. CorruptionConfig
in src/shared/types.ts has: seed, mode (union of string literals), and optional k, onset,
target (SpaceId[]), flashoverTemp, saturateAt. Dean may add more optional fields before
the freeze; the panel must not need edits when he does.

TASK: two panels in src/ui/panels/.

ScenarioPanel.tsx:
  - Plan select over PLAN_NAMES with level count and space count shown.
  - Seed number input with a "random" button that draws from makeRng(Date.now()). This
    is the ONE place a non-deterministic seed is allowed; it just picks the seed, and the
    seed is then shown and persisted so the run is reproducible.
  - Ticks input. Brains toggle: ours / both.
  - Run button. Play/pause, step back/forward, speed (1, 4, 10 ticks/sec). Scrubber.

ChaosPanel.tsx, generated from a schema, not hand-written per field:
  - Write src/ui/corruptionSchema.ts: a runtime description of CorruptionConfig, e.g.
      { key: 'mode', kind: 'enum', values: [...] }
      { key: 'k', kind: 'int', min: 0, max: 8 }
      { key: 'onset', kind: 'int', min: 0, max: 200 }
      { key: 'target', kind: 'spaces' }
      { key: 'flashoverTemp', kind: 'number', min: 200, max: 900 }
      ...
    with a compile-time exhaustiveness check so that if Dean adds a field to
    CorruptionConfig, typecheck fails until the schema lists it. A pattern that works:
      const _check: Record<Exclude<keyof CorruptionConfig, 'seed'>, true> = { mode: true, k: true, ... };
    That is the contract between his knobs and your panel.
  - Render each entry by kind: enum as select, int/number as range plus number input,
    spaces as multi-select chips over the current plan's space ids, boolean as checkbox.
  - "Break it" presets as buttons that setCorruption and run(): "freeze the ignition
    sensor", "blind the hottest neighbor", "flashover", "everything". Compute ignition
    from the plan; hottest neighbor from trace[onset] if a trace exists, else the first
    neighbor.
  - A live readout under the panel: at cursor, count of readings present vs sensors in
    the plan, and the list of sensor ids missing (dead), computed from obs vs plan, no
    truth.

Layout: left column = ScenarioPanel over ChaosPanel, center = Scene, right column = the
debug tables. Tailwind. Must not look broken at 1280px wide; ignore phones.

Wire the scene's sensor spheres to reflect corruption: present and honest green, present
but lying amber, missing red (as in checkpoint 2), so pressing a preset visibly changes
the scene.

TESTS: src/ui/corruptionSchema.test.ts asserts every schema key exists on
DEFAULT_CORRUPTION from src/corruption (import the value only) and vice versa.

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/world, src/loop.ts,
src/shared/types.ts.
```
