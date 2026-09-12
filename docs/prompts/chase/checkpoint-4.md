# Chase · Checkpoint 4 · hour 32 · Sun 8:00 PM ET

**Goal.** Drones and belief on screen. The money shot for this checkpoint is the brain hedging: two drones peeling off to cover two spaces the belief cannot separate. That has to be visible, so belief overlays, ambiguity groups, suspect sensors, and commands all render.

---

## Prompt 1 · Drones and commands

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: trace[cursor] has truth.drones (id, class, at, resource, alive), obs.drones
(what the brain saw), and commands (droneId, goTo, task) from the brain. Dean's allocator
now emits commands with tasks suppress/coat/observe/close-door/refill/hold. The scene
(src/ui/Scene.tsx) renders spaces, edges, and sensors from layoutFor(plan).

TASK: render drones and their commands in the scene.

  - Each alive drone: a small mesh above its space, offset so several drones in one space
    do not overlap (arrange in a ring). Shape and color by class: tether = cyan cylinder
    with a line back to the nearest resupply space (the hose), retardant = green
    tetrahedron, scout = white sphere, relay = yellow sphere, hatch = orange cube.
    Resource as a thin bar under the mesh.
  - Dead drones: a dim gray X at the space they died in, persisting.
  - Commands: an arrow (thin line plus cone) from the drone's current space to its goTo,
    colored by task. Fade the arrow when the drone has arrived (at === goTo).
  - Movement: interpolate drone position between trace[cursor-1] and trace[cursor] during
    playback for smoothness; snap when scrubbing.
  - Side panel: a drone table with id, class, at, goTo, task, resource, alive, and whether
    the brain's view of the drone (obs.drones) differs from truth (stale self-report).
    Highlight rows where the observed at differs from the true at.

TESTS: pure helpers only: src/ui/droneLayout.test.ts for the ring offset function
(n drones give n distinct positions, deterministic).

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/world, src/loop.ts, src/shared/types.ts.
```

---

## Prompt 2 · Truth / belief / diff split view

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: Belief has estimate (temp per space), burningSet, ambiguous (SpaceId[][]),
suspectSensors, confidence. The Scene renders truth. The store holds traces for 'ours'
and optionally 'kalman'.

TASK: make the scene renderable in three modes and show them side by side.

  - Scene gets view: 'truth' | 'belief' | 'diff' and brain: string props.
    truth: as now.
    belief: color spaces by belief.estimate; burningSet gets the emissive pulse; each
      ambiguous group gets a translucent colored hull or shared outline, one color per
      group; suspectSensors drawn as red spheres with a strike; spaces with no reading at
      all get a dim hatched material.
    diff: color by |estimate - truth| (green under 20C, amber under 80C, red beyond);
      outline spaces where burning-in-truth differs from in-burningSet, unless the space
      is inside an ambiguous group (then an amber outline: uncertain, and honest about it).
  - SplitView.tsx: three scenes sharing ONE camera (lift camera state into a store slice
    or a shared ref; orbit in one, all three move). Layout: three equal columns at 1600px
    and wider, else truth over belief with diff collapsible.
  - Header strip over the belief view: confidence as a bar and the brain name.
  - The hedge indicator: when ambiguous is non-empty AND two or more commands target
    different spaces within one group, flash a "HEDGING" badge and draw those arrows
    thicker. This is the checkpoint-4 beat; make it obvious.
  - Performance: share geometry via useMemo; 3 scenes x 24 spaces must hold 60fps on a
    laptop.

TESTS: pure helpers only: diffClass(estimate, truth, burningSet, ambiguous, spaceId)
returning 'ok' | 'warn' | 'wrong' | 'uncertain', unit tested.

Screenshot at a hedging tick on vessel-3x8 with flashover corruption; save to
docs/img/cp4-hedge.png and commit.

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/world, src/loop.ts, src/shared/types.ts.
```
