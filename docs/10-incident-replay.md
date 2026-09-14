# 10 · Incident replay: One Meridian Plaza through Firefly

The plan and its history are in `docs/10-incident-replay-plan.md`. This page is the result. Reproduce every number with `npm run incident` (26 s); the calibration with `npm test -- src/incident`; the pictures with beat **7** in the app (Case file page).

## The question

Not "would Firefly have beaten the Philadelphia Fire Department" — a compartment model cannot say that and we do not. Two questions the public record can answer:

1. **Situational awareness.** At minute *m* of the real fire, what did the incident commander know about which floors were burning, and when did each floor become known? What would each estimator have reported at the same minute from the building's own sensors, which die as the fire reaches them?
2. **Containment counterfactual.** The same fire, closed loop, with the allocator driving the drone roster from the staging floor under each belief — clearly labelled as a simulation of our physics calibrated to the report.

## The data

`data/incidents/one-meridian-plaza/`: USFA Technical Report 049 read into `sources.md` (page references) and `timeline.json` (26 events in minutes from detection, the commander's knowledge schedule, the outcome). `plan.spec.json` → `plan.json`: floors 20–31, nine zones per floor (four perimeter office zones on the north side, the core along the south wall: two stairs with standpipes, the electrical-room lobby, the elevator lobbies, the east stair), sensors exactly where the 1981 code put them — at the exits, the corner return-air intakes and the elevator lobbies, and **none in the vacant office of origin**. `plan.instrumented.json` adds one sensor per zone.

**Calibration** (`src/incident/calibration.ts`, pinned by test): one tick = 4 minutes; edge rates chosen by grid search so that an uncontrolled run meets the report's early milestones — floor 22 fully involved by 45 min (sim 44), 23 by 100 (sim 100), 24 by 150 (sim 148), 25 and 26 before the report's 352/420 (sim 196/244), 30 reached before 15:01 (sim 432), 31 and 20 never. The uncontrolled fire burns out at minute 596; the real, fought fire was under control at 1118, so after the first hours the model is faster than history, as an unfought fire should be.

## Row A · when was each floor known?

Minutes from detection. "sim caught" is the calibrated world's truth; "record" is the minute the 1991 command post was told (from windows, crews and the guard); the brain columns are the first minute each belief named a space on that floor, open loop, sensors dying above the flashover temperature. Seed 42.

| floor | sim caught | record | ours (as built) | Kalman (as built) | commander (record) | ours (instrumented) | Kalman (instrumented) |
|---|---|---|---|---|---|---|---|
| 22 (origin) | 4 | **8** | 4 | 4 | 8 | 4 | 4 |
| 23 | 100 | 80 | 108 | 76 | 80 | 108 | 76 |
| 24 | 148 | 80 | 156 | 136 | 80 | 156 | 136 |
| 25 | 196 | 352 | 204 | 184 | 352 | 204 | 184 |
| 26 | 244 | 352 | 252 | 228 | 352 | 252 | 228 |
| 27–29 | 292–388 | 800 | 300–396 | 276–372 | 800 | 300–396 | 276–372 |
| 30 | 432 | 800 | 440 | 420 | 800 | 440 | 420 |
| 21 (down the open stair) | 72 | never told | 84 | 72 | never | 84 | 72 |

| brain (as built) | false certainty | wrong dispatch | coverage | estimation error |
|---|---|---|---|---|
| ours | **0%** | 57% | 64% | 74.9 °C |
| Kalman | 4% | 98% | 53% | diverges (10⁷ °C) |
| 1991 commander | 71% | 92% | 49% | 218 °C |

What it says. Every estimator with sensors names the fire floor at minute 4, before the first engine arrived (8) — the building knew before anyone called. Ours names each new floor about one tick (4 min) after it catches; the Kalman names it before it catches (76 vs 100 for floor 23), which is the same over-reach that gives it 98 % wrong dispatch: it calls floors burning that are only hot. The commander's record lags the sim's floors by 150–500 minutes on 25–30, and reports 24 as burning at 80 when the calibrated world has it at 148: exterior observation sees flames lapping, not floor involvement. Ours never reaches confidence 0.9 on this fire — with the origin zone unsensed and sensors dying floor by floor, it keeps a wide MAYBE set (coverage 64 %) and says so; the Kalman is at 0.9 from minute 4 and diverges numerically on a 108-space plan (a baseline defect, reported to Dean, not fixed). The as-built and instrumented columns are identical: the missing origin-zone sensor costs nothing here because the neighbouring zones heat within a tick.

## Row B · if that belief had driven the drones

Closed loop, seed 42, the default six-drone roster from the staging floor (L20-B2), Dean's allocator under each belief.

| driver | space-minutes burning | floors that burned | last fire (min) | drone deaths |
|---|---|---|---|---|
| nobody (uncontrolled) | 9824 | 21–30 | 596 | – |
| **ours** | 9736 | 21–30 | 664 | 4 |
| Kalman | **396** | 22 | 204 | 0 |
| 1991 commander's knowledge | 9624 | 21–30 | 648 | 4 |
| record (1991) | – | 22–29 destroyed | 1118 (under control) | – |

**The negative result, stated by us first.** Under our belief the drones did no better than nobody. The probe (`scratchpad/omp/probe-closed.ts`, reproduced in `docs/decisions.md`) shows why: on this building the belief's burning set flips between the origin zone, its neighbour and the core lobby every tick (no sensor in the origin, then flashover killing the neighbours' sensors), and the allocator follows each flip, so the two tethers are re-targeted every tick and never hold a space; the retardant and hatch drones die on the fire floor by tick 10. The Kalman's belief is over-confident and wrong about extent, but it is *stable*: its tethers land on the two burning zones at tick 5 and stay, and the fire never leaves floor 22. Same allocator, same drones — the difference is target stability, not accuracy. The lesson for the allocator (Dean's, post-freeze): hysteresis on tether targets under low confidence, so an honest MAYBE does not become a dithering hose. Left as found; this page would be worthless if we tuned it away after seeing the answer.

## Limits

A compartment model calibrated to four early milestones; heat transfer is symmetric so the model also spreads down to 21 (the real fire only dropped there through an open stair); drones are not hose crews and the record's water problems are not modelled; the commander baseline is a belief schedule read from the report, not a model of decision-making; one seed. The report's own times are exact for three spread milestones and estimated for the rest (`timeline.json` marks which).

## What a real building would need

An alarm-panel export (zones, doors, stair and duct connections) becomes the plan file, with rates from the fire-compartment ratings; sprinkler flow switches and duct thermistors become fixed sensors; the drones become whatever mobile readings the site has. The rest of this repository runs unchanged — which is what this page just did with a 1991 office tower.
