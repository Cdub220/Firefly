# What exists at each checkpoint

For Dean, Chase, and coding agents. This is the high-level picture of the product, submission, and demo at each scored moment. The technical work behind each is in `docs/04-who-does-what.md` and the prompts in `docs/prompts/`.

Every checkpoint submission is a 60-second video plus the repo link. Every one is scored on the same rubric as the final: Innovation 30%, Technical 25%, Business Value 25%, Presentation 20%. A judge scores what exists at that hour, not what it will become. A missed checkpoint is a zero. The through-line of every video is the same sentence in a different form: **a wrong confident answer sends drones to the wrong floor; we built the system that says "22 or 30, covering both" instead.**

## Checkpoint 1 · hour 12 · Sun 12:00 AM ET (Sat midnight) · "The question"

**What exists.** A terminal, not an app. A fire spreads across six spaces. Sensors report. One sensor freezes. Two columns run side by side on identical readings: the textbook Kalman filter and our first-draft brain. Around tick 20 the Kalman column names the wrong space with confidence 0.98 and stays there while the real fire moves on. Ours reports lower confidence and flags the frozen sensor. The repo shows a clean architecture where the brain provably cannot see the truth (lint-enforced, tested).

**What the video says.** The insight, not the product. Fires destroy the sensors that report them. They do it in correlated ways. Standard estimators do not get fuzzy under that; they get confidently wrong. Here is that happening.

**Score we are chasing.** Innovation. At hour 12 a 9 or 10 means a breakthrough concept, not a finished build.

**Definition of done.** `npm run sim:freeze` prints two-brain output where Kalman is confidently wrong on at least one tick and ours is not. `npm run evidence` prints the count. Chase's fire visibly spreads in the truth column.

## Checkpoint 2 · hour 24 · Sun 12:00 PM ET · "First evidence"

**What exists.** Still mostly terminal, plus a first 3D render of a three-level structure with fire climbing between levels. The real estimator exists: it uses the structure's heat physics as a trusted reference, catches sensors that contradict physics, separates "hot here" from "burning here," and when two fire states fit the surviving data it reports both as a set with lowered confidence.

**What the video says.** One number. False certainty, ours versus Kalman, on one corruption case, across five seeds. "Kalman is confidently wrong N% of the time after the sensor freezes, ours M%, and ours covers the true fire P% of the time." First proof the idea works.

**Definition of done.** `npm run evidence` prints the table and the one-sentence summary. The split view (`npm run dev`) lays out vessel-3x8 by level with fire on two levels, has one-click demo beats, and shows per-space probabilities. The video is a screen recording of the split view, not the terminal.

## Checkpoint 3 · hour 36 · Mon 12:00 AM ET (Sun midnight) · "The method is frozen"

**What exists.** The app is usable: pick a structure, pick how to break the sensors from a chaos panel, press run, scrub. The eval harness sweeps every failure mode, corruption budget, sensor location, and seed for both brains and prints a head-to-head table on the four metrics the brief names: false certainty, estimation error, time to recovery, compute cost, plus wrong-dispatch and ambiguity coverage. We commit the freeze hash and a test that fails if the estimator changes afterward.

**What the video says.** What surprised us, with numbers from the sweep. It shows the cases where ours loses, diagnosed. The brief explicitly asks what changed in our understanding, and almost no team will do that.

**Score we are chasing.** Technical. The freeze is what makes every later number valid; a judge will ask when we froze.

**Definition of done.** `npm run sweep` finishes under 5 minutes and writes results. `docs/06-freeze.md` and `docs/07-what-surprised-us.md` exist. The chaos panel changes what the brain sees.

## Checkpoint 4 · hour 48 · Mon 12:00 PM ET · "The allocator"

**What exists.** Drones on screen. Truth, belief, and diff views side by side. The brain sends commands, treating every drone as both a suppression asset and a sensor. When the belief cannot separate two spaces, a HEDGING badge lights and two scouts peel off in different directions to cover both.

**What the video says.** That one shot. Uncertainty turned into action a judge can watch. Plus the containment curve with and without the allocator.

**Definition of done.** `npm run hedge` prints a tick where two drones target different spaces inside one ambiguous group. The split view shows it.

## Checkpoint 5 · hour 60 · Tue 12:00 AM ET (Mon midnight) · "The negative result"

**What exists.** Split screen: Kalman left, ours right, same fire, same broken sensors, a containment counter climbing faster on the left with a WRONG FLOOR flash. Then the strongest beat of the event: a small symmetric structure where two different fires produce identical readings at every sensor, so no estimator can tell them apart. Kalman commits to one and is sometimes wrong. Ours holds both. We show the cost in drone-ticks and the single added sensor that resolves it.

**Stretch.** Load the high-rise plan. Same brain, different building, nothing retrained. Twenty seconds that convert the whole market slide.

**Definition of done.** `npm run ident` prints the indistinguishability proof and the fix. `docs/05-identifiability.md` exists. Compare view works. Recording mode works.

## Final · hour 72 · Tue 12:00 PM ET (confirm with organizers)

**What exists.** A five-minute live demo driven by five preset buttons so nobody types: clean run, freeze a sensor, flashover, compare, high-rise. The writeup (`docs/08-writeup.md`): question, contribution, failure model, evidence table, negative result, assumptions and limits, what changed in our understanding, next test, how to reproduce. No network calls anywhere. A recorded backup and a replayable trace in case the live run breaks.

**Demo order.** Problem. Question. Live run. Break it. Negative result. Handoff and business case. Limits and next test, stated by us before a judge can ask.

## Market framing for the business-value slide

Ships and hangars first, then high-rises, apartment blocks, warehouses, parking structures, data centers. Keep the pitch line singular: a team that solved one hard problem and noticed it generalizes scores better than a platform for everything. The demo is not the deliverable; the result is.
