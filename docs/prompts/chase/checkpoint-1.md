# Chase · Checkpoint 1 · hour 8 · Sat 8:00 PM ET

**Goal.** A fire that actually spreads. Heat moves along plan edges at each edge's own rate, spaces ignite, fuel burns down, drones affect the fire and can die in it. `npm run sim` shows the truth burning set growing from one space to several. No UI work today; the estimator beats the visuals through hour 24.

Prompt 1 is the physics. Prompt 2 is drones and commands. Both land in `src/world`.

---

## Prompt 1 · Fire physics

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: src/world/index.ts is a stub: spaces come from the plan via instantiateSpaces,
the ignition space sits at a constant 450C, advancePhysics() is empty. src/shared/plan.ts
exports edgeMap(plan) giving, per space, its edges with { kind, rate } in both directions.
Space has temp, burning, fuel, doorsOpen. Dean's brain will model the world with a LINEAR
heat model (x_i' = x_i + sum rate * (x_j - x_i) + g if burning), so the closer the world
is to that, the cleaner the comparison; add realism on top, not instead.

TASK: implement advancePhysics() and the constants it needs, in src/world/physics.ts
(pure functions on WorldState + plan) called from index.ts. Name every constant and
export them from src/world/constants.ts with a comment; Dean will copy the ones his
brain needs.

MODEL, per tick, in this order:
  1. Heat transfer. For each edge (a,b) with rate r: effective rate = r if the edge kind
     is bulkhead, floor, or shaft; or if it is door or passage and the door is open on
     either side (b in a.doorsOpen or a in b.doorsOpen); else r * 0.2 (a closed door
     still leaks). Compute all deltas from the START-of-tick temps (synchronous update),
     then apply: temp_a += eff * (temp_b - temp_a), and symmetrically. Clamp the sum of
     outgoing effective rates per space to 0.9 so the update is stable.
  2. Generation. Each burning space with fuel > 0: temp += GEN (40 C/tick), fuel -= BURN
     (0.02/tick). If fuel hits 0, burning = false.
  3. Cooling. Every space: temp += COOL * (ambient - temp), COOL = 0.02. This is loss to
     the structure and outside so temps do not run away.
  4. Ignition. A space with burning=false, fuel > 0.2, temp >= IGNITE (250C) and at least
     one burning neighbor (any edge kind) becomes burning. Also a space above IGNITE with
     no burning neighbor ignites with probability 0.1 per tick (spontaneous, via rng).
     Ignition decisions use start-of-tick temps.
  5. Hazards. 'fuel': GEN * 1.5 and BURN * 1.5. 'ordnance': when temp >= 400 the space
     sets every neighbor's temp += 150 once (cook-off), then its hazard becomes 'none'.
     'chemical': COOL * 0.5 for that space.
  6. Doors. Every tick, each open door in a burning space closes with probability 0.01
     (structural failure), via rng. Commands (Prompt 2) also change doors.

Keep the ignition space's initial temp at 450 and burning=true from the plan.

Export from src/world/index.ts a readonly constants object and a pure
stepPhysics(state, plan, rng, effects) for tests, where effects is an optional per-space
{ suppression: number; fuelDelta: number } map that Prompt 2 will populate.

TESTS: src/world/physics.test.ts on data/structures/demo-6.json:
  - After 30 ticks the truth burning set has grown beyond the ignition space.
  - Fire reaches a space through an open door (rate 0.15) strictly before it reaches a
    space through a bulkhead (rate 0.05) at the same path length. Construct a tiny
    3-space plan inline for this.
  - Fuel decreases monotonically in a burning space and burning stops when fuel hits 0.
  - Same seed, same 50-tick trace, JSON-identical (already exists in src/loop.test.ts;
    make sure it still passes).
  - No temp is ever NaN or negative in a 200-tick run.

Then run `npm run sim` and paste the first 5 and last 5 lines in your report. The truth
column must show growth.

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/ui, src/loop.ts, src/shared/types.ts.
```

---

## Prompt 2 · Drones, commands, resupply, death

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: src/world/physics.ts spreads fire. Drones exist but commands only move them.
Command is { droneId, goTo, task }. Dean's allocator (checkpoint 4) will send task strings
'suppress', 'coat', 'observe', 'close-door', 'refill', 'hold'. Drone classes: tether,
retardant, scout, relay, hatch. World owns physical drone effects and physical death;
Dean's corruptor owns comms loss.

TASK: implement drone behavior in src/world/drones.ts, called from index.ts before
physics each tick.

MOVEMENT. A drone moves one edge per tick toward goTo along the shortest path over plan
edges (BFS; treat floor and shaft as traversable; ignore door state). Store the current
path target internally; a new command with a different goTo replans. Drone.at is the
space it is IN, never a midpoint.

EFFECTS, applied when the drone is in its goTo space:
  suppress (tether only): the space's GEN this tick is multiplied by 0.3. Two tethers
    stack to 0.3 * 0.3. Tether resource stays 1.
  coat (retardant only): the space's fuel -= 0.15 per tick, resource -= 0.15 per tick,
    until resource is 0. A space with fuel <= 0.2 will not ignite (physics.ts already
    requires fuel > 0.2).
  close-door (hatch only): close ALL open doors of the goTo space (remove from doorsOpen
    on both sides). Simple and demonstrable.
  observe / hold / anything else: no physical effect. The drone is a sensor by being there.
  refill: when at a plan.resupply space, resource = 1.
Build a per-tick effects map { spaceId: { suppression, fuelDelta } } in drones.ts and
pass it to stepPhysics, so physics.ts stays pure.

DEATH. At end of tick, any drone in a space with temp >= DRONE_DEATH (500 for tether,
400 for everything else) gets alive=false. Dead drones do not move, do not sense, and do
not appear in obs.drones. Also: a drone whose next step is a space >= DRONE_DEATH stops
one edge short and waits (a scout should not fly into a flashover on a bad command; the
brain is told nothing, it just sees the drone did not arrive).

DEFAULT ROSTER. WorldConfig.drones already exists. Default when omitted: 2 scouts, 2
tethers, 1 retardant, 1 hatch, all starting at the first resupply space. Ids D1..D6.

OBSERVATION. obs.drones lists every alive drone with its true at/resource/alive/linked
(linked always true from the world; the corruptor breaks it). Drone readings come from
every alive drone (already there).

TESTS: src/world/drones.test.ts:
  - A drone commanded from S1 to S4 on demo-6 arrives in exactly BFS-distance ticks.
  - A tether with 'suppress' in the ignition space makes that space's temp after 10 ticks
    lower than without it.
  - A retardant 'coat' on a neighbor of the ignition space delays or prevents its ignition
    versus a control run.
  - A scout commanded into a 600C space stops adjacent and stays alive.
  - A drone that IS in a space when it crosses 400C dies and vanishes from obs.drones.
  - Determinism holds.

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/ui, src/loop.ts, src/shared/types.ts.
```
