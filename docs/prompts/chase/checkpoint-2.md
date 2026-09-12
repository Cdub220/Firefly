# Chase · Checkpoint 2 · hour 16 · Sun 4:00 AM ET

**Goal.** Multi-level structures with vertical conduction, and the first render. The plan says the demo structure is a multi-deck ship, but nothing in code may say so: it is a JSON file with `floor` edges. The render at this checkpoint shows truth only; belief comes in checkpoint 4.

---

## Prompt 1 · Multi-level plans

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: data/structures/demo-6.json is one level, six spaces. StructurePlan supports
'floor' edges (vertical conduction, sets above/below) and 'shaft' edges. validatePlan and
instantiateSpaces are in src/shared/plan.ts. The world's physics treats floor and shaft
edges as always-effective heat paths.

TASK: write a plan generator and two plan files, and make plans loadable by name.

1. src/world/gen.ts exporting makeGridPlan(opts): StructurePlan with opts for name,
   levels, rows, cols, doorRate, passageRate, floorRate, shaftRate, shaftAt [row, col],
   sensorless (SpaceId[]), hazards (Record<SpaceId, Hazard>), occupants (Record<SpaceId,
   number>), resupply, ignition. Space ids "L{level}-{row}{col}" e.g. L2-B3. Rows joined
   by 'door' along the long axis, 'passage' across. 'floor' edges between vertically
   adjacent spaces everywhere. One 'shaft' chain through shaftAt on every level.
   Script `npm run gen:plans` regenerates the JSON files deterministically. The generator
   is the source; hand-edit nothing. Commit the generated JSON too.

2. data/structures/vessel-3x8.json: three levels, 2x4 grid per level, 24 spaces.
   doorRate 0.15, passageRate 0.2, floorRate 0.08 (steel conducts), shaftRate 0.3.
   Hazards: one 'fuel' space on level 1, one 'ordnance' space on level 2. Occupants 0 to
   6, more on level 3. Sensors in every space EXCEPT two interior spaces on level 2 (a
   realistic gap Dean will use). resupply: the shaft corner on level 1. ignition: the
   fuel-hazard space on level 1.

3. data/structures/tower-5x4.json: five levels, 2x2 per level, 20 spaces. doorRate 0.15,
   floorRate 0.04 (concrete slabs conduct poorly), shaftRate 0.35 (stairwell; stack
   effect is a high rate). No sensors on level 4 (that alarm loop is dead). ignition: a
   level-2 space not on the shaft. This is the stretch high-rise; it costs nothing now
   and proves the generality claim later.

4. src/shared/structures.ts exporting PLAN_NAMES and loadPlan(name). Import every plan
   JSON statically (Vite needs static imports). Make src/loop.ts's CLI accept
   --plan <name> (shared file; tiny additive change; tell Dean).

TESTS: src/world/plans.test.ts: every plan in PLAN_NAMES validates; vessel-3x8 has
above/below set on every space; a fire started on level 1 of vessel-3x8 reaches level 2
within 80 ticks in truth; on tower-5x4 the fire reaches the shaft space on level 5 before
it reaches a non-shaft space on level 3 (stack effect shows).

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/ui.
```

---

## Prompt 2 · First render

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: src/ui/App.tsx is a truth/belief table. src/ui/store.ts (zustand) calls runLoop
and holds trace + cursor. @react-three/fiber and three are installed; install
@react-three/drei (^10) for OrbitControls and Html. Plans have levels and spaces;
adjacency is derived from edges. src/shared/structures.ts exports PLAN_NAMES and
loadPlan. This is the truth-only render; belief overlays come at checkpoint 4, so make
the "which data to color by" a prop, not a rewrite.

TASK: a Three.js scene that renders the structure and the fire from trace[cursor].truth.

LAYOUT (src/ui/layout.ts, pure): given a plan, assign each space an (x, y, z). Levels
stack on y with spacing 3. Within a level, if ids match the generator's "L{n}-{row}{col}"
pattern, place on a grid; otherwise run a deterministic force layout over same-level
edges (50 iterations, seeded from a hash of the plan name). Spaces joined by a 'floor'
edge must share x and z; enforce by averaging across levels. Export a memoized
layoutFor(plan).

SCENE (src/ui/Scene.tsx):
  - Each space is a box 2 x 1.4 x 2. Color by temp: ambient slate, lerp through amber to
    red at 400C, white-hot above 600. Burning spaces get an emissive pulse.
  - Edges as thin lines: door/passage light gray, bulkhead dim, floor/shaft blue-ish
    vertical lines. Closed doors (not in doorsOpen) dim red.
  - Fixed sensors: a small sphere on top of the space. Green if it appears in
    trace[cursor].obs.readings (survived corruption), red if absent (dead or removed),
    amber if present but its reading differs from truth by more than 30C (lying). This
    is a truth-side view so using truth here is fine.
  - Occupants: a number label on the box via drei Html.
  - OrbitControls from drei.
  - Level slicer: a range input that hides levels above N so you can look inside.

APP: replace the table layout with: header (plan select over PLAN_NAMES, seed, run,
play/pause at 4 ticks/sec via requestAnimationFrame, scrubber), scene filling the
viewport, and the old truth/belief tables in a collapsible side panel. Keep the tables;
they are the debug view.

STORE: add planName, playing, and a tick() action. runLoop is synchronous and fast; run
the whole trace on "run" and just scrub.

TESTS: src/ui/layout.test.ts: same plan gives the same layout twice; spaces joined by a
floor edge share x and z; no two same-level spaces overlap (distance > 1.5).

Screenshot: run `npm run dev`, load vessel-3x8, scrub to tick 60, take a screenshot with
whatever tool is available, save to docs/img/cp2-render.png, commit it. If no screenshot
tool is available, say so.

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/world, src/loop.ts.
```
