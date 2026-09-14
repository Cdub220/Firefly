# 10 · Incident replay: was Firefly a useful tool? (plan)

Status: PLAN, not started. Written Mon Sept 14 2026 for a later session. Nothing here changes the frozen estimator; the work is data (`data/incidents/`), world calibration (rates in plan files), an evaluation baseline, and a view.

## How to start the next session (read this first)

State of the repo when this was written: `main` = `chase-branch` = the CP5 work (all three prompts in `docs/prompts/chase/checkpoint-5.md` built and verifier-PASSed; head to head, demo script on keys 1-5 with recording mode and a replay backup, tower generality with `docs/09-generality.md`). Dean's side on `main`: allocator, decision log, identifiability (`npm run ident`, `docs/05-identifiability.md`), freeze record (`docs/06-freeze.md`), CP3 report, writeup skeleton (`docs/08-writeup.md`). The estimator is frozen; the freeze test diffs the frozen files against recorded hashes, so this work must not touch `src/brain` (allocator hook aside, Dean's call), and Chase must not touch `src/eval`.

Prompt to open with: **"Read docs/10-incident-replay-plan.md and start step 1."** Then the usual loop from `docs/automation.md`: implement, `npm test && npm run lint && npm run typecheck`, probe, commit, `verifier` subagent, fix, repeat; merge to `main` and push only when asked.

Practicalities that cost time last session, so they are written down:
- The shell defaults to Node 16, which crashes vitest/eslint; prefix commands with `export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"` (or `nvm alias default 22` once). The post-edit hook's "ESLint ... structuredClone is not defined" message is that same Node 16 problem, not a lint failure.
- `npm run sweep` (any flags) overwrites `results/sweep-latest.json`, Dean's full 7200-row sweep that `src/ui/sweepSummary.json` is folded from; `git checkout results/sweep-latest.json` afterwards and delete the stamped `results/sweep-<timestamp>.json`.
- Headless Chrome screenshots need `--headless=new --use-angle=metal --enable-gpu --ignore-gpu-blocklist`; drive it over CDP; bind the store through the *first* Vite module URL matching `/src/ui/store.ts` (HMR variants with `?t=` are stale instances).
- `data/codes/` is git-ignored (the LOER guide is a third-party PDF, kept locally only). Anyone else needs their own copy at `data/codes/LOER.pdf`; the plan below quotes what it needs from it.

Where the pieces this plan builds on live:
- Plan files and their schema: `data/structures/*.json`, `src/shared/types.ts` (`StructurePlan`: spaces with level/fuel/hazard/occupants, edges with kind and rate, fixed sensors, ignition, resupply), `src/shared/structures.ts` (`PLAN_NAMES`, `loadPlan`), `src/shared/plan.ts`; generator in `src/world/gen-plans.ts`.
- World physics and constants: `src/world/physics.ts`, `src/world/constants.ts` (`GEN_RATE 0.25`, `FLAME_TEMP 900`, `COOL 0.02`, `IGNITE 250`, `CLOSED_DOOR_LEAK 0.2`, `MAX_OUTGOING_RATE 0.9`; drones `DRONE_DEATH 400`, `DRONE_DEATH_TETHER 900`, `TETHER_SUPPRESSION 0.3`, `TETHER_COOL 0.1`, `COAT_RATE 0.15`); the loop in `src/loop.ts` (`runLoop`, `runLoopMulti`, `LoopConfig.dispatch` for closed loop, `LoopConfig.drones` for a roster).
- Baselines and harness (Dean): `src/brain/kalman.ts` (`createKalmanBrain`, `createKalmanDispatching`, `withAllocator`), `src/eval/metrics.ts` (`computeMetrics`, `isHedge`), `src/eval/containment.ts` (`runContainment`, `withoutCommands`), `src/eval/outcome.ts` (`computeOutcome`, events), `src/eval/narrate.ts` (decision log), `src/eval/brief-cli.ts` (`npm run brief`, `npm run showdown`).
- UI (Chase): `src/ui/store.ts` (beats, `runBeat`, `runCompare`, `runShowdown`, replay), `src/ui/compare/` (head to head, scorecard with the sweep row, containment chart), `src/ui/panels/` (beats row, briefing), `src/ui/scene/` (3D), `src/ui/split/` (2D). Adding a view = a `View` entry in `store.ts` plus a component picked in `src/ui/App.tsx`.
- Docs to keep in step: `docs/decisions.md` (one row per non-obvious call), `docs/08-writeup.md` (Dean's skeleton; the result section of this plan goes there too).

## The question, stated so it can be answered

"Is Firefly better than the firefighters" is not a claim a compartment simulation can defend, and a judge will say so. The question that *can* be answered from public incident reports is:

1. **Situational awareness.** At minute *t* of a real fire, what did the incident commander know about which floors were burning, and when did that become certain? What would Firefly's estimator have reported at the same minute, from the sensors the building actually had (and, as a second row, from the sensors a modern code building has)?
2. **Containment counterfactual.** Run the real building and the real ignition through the closed loop with the allocator dispatching, and compare space-minutes burned and time-to-control against the report's timeline — clearly labelled as a simulation of *our* physics calibrated to the report, not a re-enactment.

Both rows come from the same run. The honest headline is "earlier, more certain awareness; here is the counterfactual", not "we beat the fire department".

## Candidate incidents (pick one, maybe two)

Chosen for the depth of the public record: floor plans, floor-by-floor spread with times, alarm/arrival/first-water/control times.

| Incident | Why it qualifies | Primary source |
|---|---|---|
| **One Meridian Plaza, Philadelphia, 1991** (recommended first) | 38 storeys; fire started on the 22nd floor, climbed to the 30th over ~19 h; standpipe pressure problems; stopped by sprinklers on 30. The USFA report has floor plans, a minute-by-minute timeline, and the reasons each floor was lost. | USFA Technical Report Series 049 (FEMA); NFPA investigation report |
| **First Interstate Bank, Los Angeles, 1988** | 62 storeys; 12th-floor start, 4½ floors in ~3.5 h; detailed timeline and plans; sensors were being installed at the time (a natural "as built vs instrumented" comparison). | USFA Technical Report 022 |
| **Cook County Administration Building, Chicago, 2003** | 35 storeys; 12th-floor storage room; locked stair doors; NIST fire model reconstruction exists (a physics reference to calibrate against). | NIST NCSTAR / James Lee Witt Associates report |
| **Grenfell Tower, London, 2017** (stretch) | 24 storeys, exterior spread; the Phase 1 inquiry has a minute-level timeline per flat. Exterior spread is a different physics (edges between facade panels), which is exactly the "structure is data" point. | Grenfell Tower Inquiry Phase 1 report |

`data/codes/LOER.pdf` (DeKalb County Fire Rescue, Low Occurrence Elevated Risk guide, updated 8/12/25; section 1 = High-rise Fires) is the procedure reference for the **human baseline**: lobby control, staging two floors below the fire, standpipe operations, evacuation order. It gives the timings and the information flow a commander actually has.

## Deliverables

```
data/incidents/<slug>/
  sources.md        links, page numbers, what was read from where
  timeline.json     events in minutes from ignition: detection, alarm, 911, first arrival,
                    lobby control, staging, first water on fire floor, each floor's
                    involvement time, control, extinguishment; casualties; notes
  plan.json         a StructurePlan of the involved floors +/- 2: per floor a core,
                    corridor(s), stair shafts, elevator shafts, office/tenant zones as spaces;
                    slab edges (floor), stair/elevator shafts (shaft), doors/passages, and,
                    where the report says the fire climbed the facade, exterior edges;
                    sensors as the building had them (as-built) — a second file
                    plan.instrumented.json adds one sensor per zone (modern code)
  README.md         one paragraph: what happened, in the report's own numbers
docs/10-incident-replay.md   the result page (this file becomes the plan section of it)
src/ui/incident/            "Case file" view: timeline strip (report events), the sim's
                            belief-certainty and burning-count curves overlaid in minutes,
                            a minute scrubber, the two rows above
```

## Steps (in order, each verifiable)

1. **Choose and read** (Chase, ~1 h). One Meridian Plaza first. Fill `sources.md` and `timeline.json` from the USFA report; every number carries a page reference.
2. **Plan file** (Chase, ~2 h). Trace the typical floor plan into zones; 7–9 involved floors; ids stay generic (`L22-CORE`, `L22-N`, ...) — no incident names in `src/`. `npm run sim -- --plan <slug>` must run clean; the structure tests (`src/shared/plan.test.ts`) pass on it.
3. **Calibrate tick = 1 minute** (Chase, ~2 h). Tune the plan's edge rates (data, not code) so an *uncontrolled* open-loop run reproduces the report's floor-by-floor involvement times within a stated tolerance (e.g. each floor within ±20 min of the report). Record the fit in `docs/10-incident-replay.md`; add a test that pins it. If `src/world/constants.ts` needs a per-plan override (e.g. fuel per zone), that is Chase's file and stays a plan-level knob.
4. **Human-commander baseline** (Dean, ~2 h). A scripted brain/allocator in `src/eval/` that follows the LOER section-1 procedure and the report's own timing: belief = what the commander knew at each minute (alarm panel zones + radio reports, which the timeline gives), commands = crews to the staging floor at the report's first-water time, advancing floor by floor at the report's rate. Zero estimator changes (freeze holds). `withAllocator` and `runContainment` already exist.
5. **Run the three rows** (either, ~1 h): historical (from the timeline), commander baseline (sim), Firefly (sim, as-built sensors) and Firefly (instrumented). Metrics: minute the fire floor was named with confidence ≥ 0.9; minutes each floor was known before it was lost; space-minutes burned; time-to-control. `npm run incident -- --slug <slug>` writes `results/incident-<slug>.json/.md`.
6. **Case file view** (Chase, ~3 h) + demo beat 7 in recording mode with the caption written from the numbers, and the limits stated on screen (compartment model, calibrated rates, no wind, no crews modelled beyond the procedure).
7. **Writeup** (~1 h): a section in `docs/08-writeup.md` and the result page; say what a real building would need (alarm panel export → plan file; flow switches → fixed sensors).

Total: roughly 12 hours for one incident with two people; a second incident is mostly steps 1–3 again.

## Risks and how they are handled

- **Blueprint fidelity.** Public reports give typical floor plans, not every wall. Zones at the level of "north office area / core / stair A" are enough for the compartment model and are what an alarm panel reports anyway. Say so.
- **Physics is a compartment model tuned in ticks.** Calibration to the report's own timeline (step 3) is the only honest basis; the fit and its residuals are published, and the counterfactual is labelled as such.
- **Sensor reality.** 1980s–90s buildings had few detectors. The as-built row will look poor for every brain; that is the point of the instrumented row, and the LOER guide's annunciator-panel expectations define "instrumented".
- **Overclaiming.** The result page leads with the situational-awareness comparison (defensible) and presents containment as a counterfactual with its assumptions listed. No "beat the firefighters" language anywhere in the repo.
- **Freeze.** Only data, eval baselines, world knobs and UI change. The `docs/06-freeze.md` hash test stays green.
