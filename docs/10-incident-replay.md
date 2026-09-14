# 10 · Incident replay: One Meridian Plaza through Firefly

The plan and its history are in `docs/10-incident-replay-plan.md`. This page is the result. Reproduce every number with `npm run incident` (26 s); the calibration with `npm test -- src/incident`; the pictures with beat **7** in the app (Case file page).

## The question

Not "would Firefly have beaten the Philadelphia Fire Department" — a compartment model cannot say that and we do not. Two questions the public record can answer:

1. **Situational awareness.** At minute *m* of the real fire, what did the incident commander know about which floors were burning, and when did each floor become known? What would each estimator have reported at the same minute from the building's own sensors, which die as the fire reaches them?
2. **Containment counterfactual.** The same fire, closed loop, with the allocator driving the drone roster from the staging floor under each belief — clearly labelled as a simulation of our physics calibrated to the report.

## The data

`data/incidents/one-meridian-plaza/`: USFA Technical Report 049 read into `sources.md` (page references) and `timeline.json` (26 events in minutes from detection, the commander's knowledge schedule, the outcome). `plan.spec.json` → `plan.json`: floors 20–31, nine zones per floor (four perimeter office zones on the north side, the core along the south wall: two stairs with standpipes, the electrical-room lobby, the elevator lobbies, the east stair), sensors exactly where the 1981 code put them — at the exits, the corner return-air intakes and the elevator lobbies, and **none in the vacant office of origin**. `plan.instrumented.json` adds one sensor per zone.

**Calibration** (`src/incident/calibration.ts`, pinned by test): one tick = 4 minutes; edge rates chosen by grid search so that an uncontrolled run meets the report's early milestones — floor 22 fully involved by 45 min (sim 44), 23 by 120 (sim 100), 24 by 170 (sim 148), 25 and 26 before the report's 352/420 (sim 196/244), 30 reached before 15:01 (sim 432), 31 and 20 never burn. The uncontrolled fire burns out at minute 596; the real, fought fire was under control at 1118, so after the first hours the model is faster than history, as an unfought fire should be. Seed 42 throughout; other seeds move the floor times by a tick or two (seed 1 puts 23 at 104 and 24 at 152; seed 3 at 108 and 156, and has floor 22 fully involved at 48, three minutes outside the 45-minute window), so the fit is a seed-42 fit with the 23/24 windows widened to cover the neighbours.

## Row A · when was each floor known?

Minutes from detection. "sim caught" is the calibrated world's truth; "record" is the minute the 1991 command post was told (from windows, crews and the guard); the brain columns are the first minute each belief named a space on that floor, open loop, sensors dying above the flashover temperature. Seed 42.

| floor | sim caught | record | ours (as built) | Kalman (as built) | commander (record) | ours (instrumented) | Kalman (instrumented) |
|---|---|---|---|---|---|---|---|
| 31 (sprinklered, never burned) | never | never | **468** | **380** | never | 472 | 456 |
| 30 | 432 | 800 | 424 | 352 | 800 | 440 | 420 |
| 29 | 388 | 800 | 368 | 308 | 800 | 396 | 372 |
| 28 | 340 | 800 | 344 | 268 | 800 | 348 | 324 |
| 27 | 292 | 800 | 296 | 228 | 800 | 300 | 276 |
| 26 | 244 | 352 | 248 | 192 | 352 | 252 | 228 |
| 25 | 196 | 352 | 200 | 156 | 352 | 204 | 184 |
| 24 | 148 | 80 | 152 | 124 | 80 | 156 | 136 |
| 23 | 100 | 80 | 104 | 72 | 80 | 108 | 76 |
| 22 (origin) | 4 | **8** | 4 | 4 | 8 | 4 | 4 |
| 21 (down the open stair) | 72 | never told | 76 | 64 | never | 84 | 72 |
| 20 (staging floor, never burned) | never | never | **116** | **100** | never | 124 | 104 |

Bold numbers against "never" are false alarms: both estimators name the non-combustible staging floor and the sprinklered 31st as burning when they are merely hot (L20-B2 reaches ~290 °C with fuel below the ignition minimum), which is what an estimator that only sees temperatures must say. Table generated from `results.json` (as-built = `awareness[0..2]`, instrumented = `awareness[3..5]`).

| brain (as built) | false certainty | wrong dispatch | coverage | estimation error |
|---|---|---|---|---|
| ours | **0%** | 57% | 64% | 74.9 °C |
| Kalman | 21% | 98% | 99% | 371.7 °C |
| 1991 commander | 71% | 92% | 49% | 218 °C |

What it says. Every estimator with sensors names the fire floor at minute 4, before the first engine arrived (8) — the building knew before anyone called. On floors 23–28 ours names each new floor one tick (4 min) after it catches; on 29 and 30 it names them 8–20 minutes *before* they catch, and it also names 20 and 31, which never burn: with every sensor above the fire dead, it is reading a hot floor as a burning one. The Kalman names every floor 8–80 minutes before it catches (72 vs 100 for floor 23), the over-reach behind its 98 % wrong dispatch. The commander's record lags the sim's floors by 108–508 minutes on 25–30, and reports 24 as burning at 80 when the calibrated world has it at 148: exterior observation sees flames lapping, not floor involvement. Ours never reaches confidence 0.9 on this fire — with the origin zone unsensed and sensors dying floor by floor, it keeps a wide MAYBE set (coverage 64 %) and says so; the Kalman is at 0.9 from minute 4, false-certain on 21 % of ticks with a 372 °C estimation error. (Before Mon hour 47 the baseline's transition matrix lacked the structure's outgoing-rate clamp, which the world and the brain's physics both apply, and on this 108-space plan, where 26 zones have edge rates summing past 1, it diverged to estimates in the millions of degrees; its false certainty then read 4 % and its floor times ran 4–8 minutes later on floors 24–31, both artefacts of a filter that had blown up. Fixed in `src/brain/kalman.ts`; the tables above are the fixed baseline; the divergent run is `git show dbd6f6e:data/incidents/one-meridian-plaza/results.json`.) Instrumenting the building (a sensor in every zone) changes little: the same floors are named 4–28 minutes later for ours and 4–76 later for the Kalman, and ours' wrong-dispatch rate rises from 57 % to 92 % — more sensors above the fire means more hot readings to over-interpret once they start dying.

## Row B · if that belief had driven the drones

Closed loop, seed 42, the default six-drone roster from the staging floor (L20-B2), Dean's allocator under each belief.

| driver | space-minutes burning | floors that burned | last fire (min) | drone deaths |
|---|---|---|---|---|
| nobody (uncontrolled) | 9824 | 21–30 | 596 | – |
| **ours** | **396** | 22 | 204 | 0 |
| Kalman | **396** | 22 | 204 | 0 |
| 1991 commander's knowledge | 9624 | 21–30 | 648 | 4 |
| record (1991) | – | 22–29 destroyed | 1118 (under control) | – |

**The negative result, found first, and what it changed.** As first run (Mon hour 46, commit dbd6f6e), under our belief the drones did no better than nobody: 9736 space-minutes against 9824 uncontrolled, floors 21–30 burned, four drones lost. A tick-by-tick probe of that run (findings in `docs/decisions.md`, Mon hour 46; reproduce on that commit with `runLoop({ plan: loadPlan('highrise-12x9'), seed: 42, ticks: 40, brain: createBrain, corruption: { mode: 'flashover', onset: 1 }, dispatch: true })` and print `belief.burningSet` and `commands` per tick) showed why: on this building the belief's burning set flips between the origin zone, its neighbour and the core lobby every tick (no sensor in the origin, then flashover killing the neighbours' sensors), and the allocator followed each flip, so the two tethers were re-targeted six times in the first ten ticks and never held a space; the retardant and hatch drones died on the fire floor by tick 10. The Kalman's belief is over-confident and wrong about extent, but it is *stable*: its tethers land on the two burning zones at tick 5 and stay, and the fire never leaves floor 22. Same allocator, same drones — the difference was target stability, not accuracy. That finding was written down before anything was changed.

It pointed at the allocator, which is not frozen, and the fix is one rule (`STICKY_TEMP` in `src/brain/allocator.ts`, Mon hour 47): a tether standing in the room it was sent to suppress keeps suppressing it while that room is still hot (estimate ≥ 200 °C) and still a candidate (believed burning, ambiguous, or next to either), whatever the belief's burning set says this tick. The allocator's 15 % score hysteresis could not do this, because when a low-confidence belief drops a room from its set the room's containment score collapses far past any margin. Why 200 °C and not the 250 °C ignition point: the model's fire goes out only when its fuel is gone, one tether holds a burning room at 250–280 °C and dips under 250 on some ticks (with a 250 °C rule the origin room read 249 °C at tick 7, the tether left, and the room was back at 499 °C five ticks later), while a room that is not burning falls under 200 °C within two ticks of a tether's cooling. The **ours** row above is the re-run with that rule: the two tethers reach the two burning rooms at tick 5 and stay until the fuel is gone, the fire never leaves floor 22, no drone dies — the same 396 space-minutes as the Kalman-driven run, because both beliefs now hold the same two rooms. The Showdown demo case on the vessel (blind ignition sensor from t = 1) is unchanged by the rule: ours one space, fire out at tick 34, no deaths. What did not change is row A: ours' open-loop belief on this fire is as wide and as low-confidence as before; the allocator now tolerates that instead of amplifying it. The estimator was not touched.

## Limits

A compartment model calibrated to four early milestones; heat transfer is symmetric so the model also spreads down to 21 (the real fire only dropped there through an open stair); drones are not hose crews and the record's water problems are not modelled; the commander baseline is a belief schedule read from the report, not a model of decision-making; one seed. The report's own times are exact for three spread milestones and estimated for the rest (`timeline.json` marks which).

## What a real building would need

An alarm-panel export (zones, doors, stair and duct connections) becomes the plan file, with rates from the fire-compartment ratings; sprinkler flow switches and duct thermistors become fixed sensors; the drones become whatever mobile readings the site has. The rest of this repository runs unchanged — which is what this page just did with a 1991 office tower.
