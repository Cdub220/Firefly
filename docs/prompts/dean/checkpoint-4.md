# Dean · Checkpoint 4 · hour 48 · Mon 12:00 PM ET

**Goal.** The allocator. Every drone sent somewhere is both a suppression asset and a measurement, so we choose placements by containment value plus information value, jointly. The visible behavior for the video: when the belief is ambiguous between two spaces, the brain hedges and splits units to cover both.

The estimator is frozen. The allocator is new code in new files and reads `Belief`; it does not change how belief is computed.

---

## Prompt 1 · The allocator

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: The estimator (src/brain/index.ts, consistency.ts, hypotheses.ts, physics.ts) and
src/corruption are FROZEN; src/eval/freeze.test.ts fails if they change. step() currently
returns commands: []. Drone classes: tether (holds a line in a burning space, resource
always 1), retardant (coats unburned material, spends resource), scout (pure sensor),
relay (extends comms; treat as scout for now), hatch (closes doors). Chase's world applies
these effects; read src/world/drones.ts for the exact semantics but do not import it.
Read the Command type: { droneId, goTo, task }. Use task strings 'suppress', 'coat',
'observe', 'close-door', 'refill', 'hold'.

NOTE (added hour 18): if CP3 prompt 2c ran, src/brain/commands.ts already exists with a
planCommands() hook that index.ts calls. In that case do NOT edit index.ts at all and do not
record a second hash: fill in commands.ts to call allocate(), and ignore the paragraph below
about the one-hunk index.ts change.

TASK: src/brain/allocator.ts exporting
  allocate(plan, belief: Belief, hypotheses: Set<SpaceId>[], drones: Drone[], prevCommands: Command[]): Command[]
and wire it into step() in src/brain/index.ts. That file is frozen for estimator logic,
so the ONLY permitted change there is replacing the empty commands array with a call to
allocate(). Keep the diff to that one hunk and say so in the commit message. The freeze
test diffs index.ts, so update the freeze test to exclude that one hunk by moving the
allocator call behind a single exported hook function in a NEW file
src/brain/commands.ts that index.ts calls; then index.ts changes by exactly one import
and one line, and docs/06-freeze.md gets a note recording the second hash and the reason.

SCORING. For each alive, linked drone and each candidate space s (spaces in burningSet,
in any ambiguous group, or adjacent to either), compute:

  containment(s, class):
    tether:      P(s burning) * (1 + 0.5 * occupants(s) + hazardWeight(s))
    retardant:   P(s adjacent to burning and not burning) * fuel(s) * (1 + hazardWeight(s))
    hatch:       P(s burning) * number of open doors from s to unburned spaces
    scout/relay: 0
  where P(s burning) = fraction of kept hypotheses containing s (1.0 in burningSet, 0.5 in
  a two-way ambiguity, etc.), hazardWeight = ordnance 3, fuel 2, chemical 2, none 0.
  Occupants, hazard and fuel come from the plan, not from truth.

  information(s):
    The expected reduction in number of kept hypotheses if a trusted reading at s arrived.
    For each kept hypothesis h, predicted temp at s = steadyState(h)[s]. Bucket hypotheses
    by whether predicted temp > 200. information = 1 - (size of the larger bucket / total).
    Zero if s already has a trusted reading this tick.

  score(drone, s) = w_c * containment + w_i * information - w_d * pathLength(drone.at, s)
  with w_c = 1, w_i = 2 for scout/relay and 0.7 for others, w_d = 0.05. pathLength is
  BFS over plan edges (any kind), ignoring door state.

ASSIGNMENT. Greedy with diversity: repeatedly pick the (drone, s) pair with the highest
score, assign it, then multiply information(s) by 0.3 for the remaining drones (a second
sensor in the same space is worth less) and multiply containment(s) by 0.6. This is what
makes the allocator SPLIT units across an ambiguous pair instead of piling onto one.

HYSTERESIS. If a drone's previous command targets a space whose current score is within
15% of its best new score, keep the previous command. Drones should not oscillate.

RESOURCE. Retardant drones with resource < 0.15 get task 'refill' to the nearest
plan.resupply space. Tethers never refill.

SAFETY. Never send a non-tether drone into a space whose estimate > 400 (drones die).
Tethers may enter up to 600.

TESTS: src/brain/allocator.test.ts, hand-built inputs, no world:
  - Two-way ambiguity {S2} | {S4}, two scouts at S1: one goes to S2 and one to S4.
  - Same ambiguity, one scout: it goes to whichever has higher information (they tie, so
    the shorter path).
  - burningSet {S3} unambiguous, tether at S1: goes to S3 with task 'suppress'.
  - Retardant at S1 with resource 0.1: task 'refill', goTo a resupply space.
  - Hysteresis: a drone already at its target with a 10% worse score stays.

DO NOT TOUCH: src/world, src/ui, src/corruption, src/brain/consistency.ts,
src/brain/hypotheses.ts, src/brain/physics.ts, src/brain/kalman.ts.
```

---

## Prompt 2 · Show the hedge

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: src/brain/allocator.ts assigns drones by containment + information with greedy
diversity. The world applies commands. Chase is building drone rendering on his side.

TASK: make the hedging behavior measurable and reproducible for the video.

1. src/eval/metrics.ts: add two metrics computed from trace commands and truth:
   - hedgeRate: fraction of ticks where belief.ambiguous is non-empty AND commands target
     at least two different spaces within one ambiguous group.
   - containmentDelta: (spaces burning in truth at the last tick, with the allocator)
     minus (same, with a null allocator that sends no commands). Requires running the
     loop twice; add a helper in src/eval/ that does it using createBrain and a wrapper
     brain that strips commands.
   Extend the return type additively.
2. `npm run hedge`: runs flashover on the ignition space, k=2, on the largest plan in
   PLAN_NAMES, with 2 scouts + 2 tethers + 1 retardant (pass a roster through
   WorldConfig.drones). Prints, per tick from onset to onset+20: t, ambiguous groups,
   each drone's command as "D1->S4 observe", and the truth burning set. Then prints
   hedgeRate and containmentDelta. Save the text to results/hedge-cp4.txt and commit it.
3. src/loop.test.ts: add a test that when a two-way ambiguity exists at some tick in the
   flashover run, at least two drones have different goTo within that ambiguous group.
   If the frozen estimator never produces a two-way ambiguity on the current plans, say
   so in the report instead of forcing it, and note which plan/mode came closest.

DO NOT TOUCH: src/world, src/ui, src/corruption, frozen estimator files.
```

---

## Prompt 3 · The commander's brief: same allocator, two beliefs, one world each

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: The allocator (src/brain/allocator.ts, via src/brain/commands.ts) turns a Belief
into drone commands. The Kalman baselines return commands: [] and so never dispatch. The
single-brain loop `runLoop({ plan, seed, ticks, corruption, brain })` in src/loop.ts already
applies that brain's own commands to its own world, so a closed-loop comparison is two
runLoop calls with the same seed and different brain factories. Every TickRecord carries
truth (spaces with temp, burning, fuel; drones with class, at, resource, alive), obs, belief
and commands. Drone effects in the world (read src/world/constants.ts, do not import
src/world): a tether in a space multiplies heat generation by TETHER_SUPPRESSION and cools
by TETHER_COOL per tick; a retardant drone removes COAT_RATE fuel per tick while coating
and spends its own resource at the same rate; a hatch closes doors; drones die above
DRONE_DEATH unless tethered.

TASK A (the baseline dispatches): in src/brain/kalman.ts add
  withAllocator(factory: BrainFactory): BrainFactory
that wraps any brain so its commands come from planCommands() in src/brain/commands.ts with
kept = [new Set(belief.burningSet)] (a filter has exactly one hypothesis, so it never
hedges). Export createKalmanDispatching = withAllocator(createKalmanBrain) and
createSourceKalmanDispatching = withAllocator(createSourceKalmanBrain). Our brain already
dispatches through the hook.

TASK B (outcomes): src/eval/outcome.ts, pure, exporting computeOutcome(trace, plan):
  fireVolume          space-ticks burning over the run (the area under the burning-count curve)
  peakBurning         max number of spaces burning at once
  spacesBurnedOut     spaces whose fuel reached 0
  containedAt         first tick after which the set of spaces that have EVER burned stops
                      growing for the rest of the run (null if the last ignition is within
                      10 ticks of the end)
  extinguishedAt      first tick with zero burning spaces after the first ignition (null if never)
  dronesUsed          per class, drones that received at least one command other than 'hold'
  tetherTicks         drone-ticks a tether spent with task 'suppress' in a space (the water bill)
  retardantSpent      total retardant resource consumed
  droneDeaths         per class
  wrongFloor          commands whose goTo space was, in truth, neither burning nor adjacent
                      to a burning space at that tick (drones sent to the wrong place)
  hedges              ticks where two drones were commanded to different spaces inside one
                      ambiguous group of the belief
  and an events list, one line per event, in tick order:
    ignition of a space; a sensor's reading first diverging from truth by > 30 C or going
    stale (the corruptor's doing, visible from obs vs truth); the brain first marking a
    sensor suspect; each dispatch (drone, class, from, to, task); a hedge; a drone death;
    a space burning out; containment; extinguished.

TASK C (the brief): src/eval/brief.ts exporting renderBrief(name, trace, plan, outcome):
string, templated text, NO API call. Sections: "Situation" (plan, fire start, failure mode,
seed), "Play by play" (the events list, at most 40 lines, tick-stamped), "Outcome" (the
numbers above), and one closing sentence chosen from a template by outcome (contained /
not contained / extinguished). Then `npm run brief -- --plan vessel-3x8 --mode flashover
--seed 7 --ticks 120 [--brains ours,kalman-source]` (src/eval/brief-cli.ts): runs each
named brain closed-loop on the same seed, prints each brief, then a side-by-side table
(fireVolume, peakBurning, containedAt, extinguishedAt, spacesBurnedOut, tetherTicks,
retardantSpent, droneDeaths, wrongFloor, hedges) and writes results/brief-<plan>-<mode>-
<seed>.md and .json. Default brains: ours, kalman, kalman-source. Add the script to
package.json. Use the same corruption defaults as the sweep (onset 5, k 1, target =
ignition space).

TASK D (numbers for the video): run the brief on demo-6, vessel-3x8 and tower-5x4 for
freeze, blind, flashover, seeds 7, 8, 9, and add a row to docs/decisions.md with the
side-by-side means. The claim we hope to make: with the same allocator, our belief
contains the fire sooner, burns fewer spaces, sends fewer drones to the wrong place, and
spends less water. Whatever the numbers say, report them. If ours loses on any of these on
any plan, say which and why, and do not touch the estimator or the allocator weights to fix
it in this prompt.

TESTS: src/eval/outcome.test.ts on hand-built traces (see src/eval/metrics.test.ts for the
rec() builder pattern): fireVolume and peakBurning by hand; containedAt null when the last
ignition is late; wrongFloor counts a command to a cold non-adjacent space and not one to
a burning space; hedges counts one tick with two drones in one ambiguous group; dronesUsed
ignores 'hold'. src/eval/brief.test.ts: the brief contains every section header, at most
40 play-by-play lines, and is byte-identical on two calls (deterministic). One end-to-end
test: `npm run brief` equivalent on demo-6 freeze seed 7, 60 ticks, three brains, asserts
every outcome field is finite or null and the table has one row per brain.

CONTRACT NOTE FOR CHASE: the .json the CLI writes is what the UI's "Commander's brief"
panel should render (Chase, CP5); put its shape in src/eval/outcome.ts as exported types
and mention it in docs/decisions.md.

DO NOT TOUCH: src/brain/index.ts, consistency.ts, hypotheses.ts, physics.ts,
src/corruption, src/world, src/ui.
```
