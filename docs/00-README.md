# Firefly — shared context for humans and coding agents

This folder is the single source of truth for what we are building and the rules we are building under. **Any agent working in this repo should read this file first, then the three docs below as needed.**

| File | What it is | Read it when |
|------|-----------|--------------|
| `01-firefly-pitch-and-plan.md` | Our pitch, architecture, schema, who-does-what schedule, hard rules, cut list | Always. This is the plan. |
| `02-defense-track-brief.md` | The organizers' Defense track challenge brief and FAQ | Designing the estimator, corruption model, eval harness, or writeup |
| `03-team-playbook.md` | Event-wide rules: rubric, weights, scoring formula | Making a checkpoint video or deciding what to prioritize |
| `source/*.pdf` | The original PDFs the markdown was transcribed from | Only if you suspect a transcription error |

## The one-paragraph version

Firefly is the decision brain for a firefighting drone swarm inside a large enclosed structure. The hard problem is that **the fire destroys the sensors that report it**, and it destroys them in correlated ways (a compartment flashes over and every sensor in it dies at once). Textbook estimators assume independent noise and converge *confidently on the wrong answer* under that kind of structured corruption. We build (1) an estimator that uses physics (heat paths, conservation) as a trusted reference, separates "hot here" from "burning here," and reports honest ambiguity as a *set* of possible fire states rather than a point; and (2) an allocator that treats every drone as both a suppression asset and a sensor, so suppression and observability are solved jointly. The demo is a Navy amphibious assault ship. **Nothing in the code is naval** — the structure is a JSON plan; a high-rise is a different file, not different code.

## What we are judged on

Rubric (same every round): Innovation 30% · Technical 25% · Business Value 25% · Presentation 20%.
Placement = final score + average of 5 check-in scores. **A missed check-in is a zero.**

The Defense brief names four metrics we must report: **false certainty, estimation error, time to recovery, computation cost.** It also says a polished UI alone proves nothing, and a rigorous negative (impossibility) result is valuable.

## Deliverables (never cut)

1. Estimator + corruption model + Kalman baseline on identical seeds/corruption
2. Eval harness reporting the four metrics, sweeping corruption location / correlation / k
3. One identifiability (negative) result: two fire states our sensors provably can't distinguish, the operational cost, and the one extra observation that fixes it
4. Checkpoint videos (60s each) + final writeup: question, contribution, assumptions, limits, next test

## Hard rules for anyone touching the code

- **Structure is data, not code.** No ship-specific names in types or logic. Plans are JSON with per-edge transfer rates.
- **Close the loop by hour 6.** World → corruption → estimator → output must compose before anything else gets polished.
- **Freeze the method at hour 24 (Sun 12:00 PM ET).** After that, no tuning of the estimator. Evaluation cases are chosen after the freeze. Record the freeze commit hash.
- **The estimator does not know the true failure pattern.** The corruption injector and the estimator must not share state.
- **Nothing in the final demo depends on a live API call.** Cache generated plans and briefings.
- **Through hour 24, the estimator beats the visuals.** Every time.

## Division of labor

- **Dean:** estimator, corruption injector, Kalman baseline, eval harness, allocator, identifiability result, briefings.
- **Chase:** repo scaffold, world sim (fire spread, multi-deck, vertical conduction), rendering, scenario picker, chaos panel, drone rendering, truth/belief/diff split view, split-screen baseline, containment counter, polish, stretch high-rise plan.

## Schedule discrepancies (resolved)

The three docs disagree on timing. Our working plan is `01-firefly-pitch-and-plan.md`:

- Playbook: 72 h, check-ins every 12 h.
- Defense brief: 50 h, check-ins Sat 10 PM / Sun 10 AM / Sun 10 PM / Mon 10 AM, final Mon noon ET.
- **Our plan (authoritative):** 49 h, Sat 12:00 PM ET → Mon 1:00 PM ET, check-ins at hours 8/16/24/32/40, final at 49.

If the organizers publish an updated schedule, update `01-firefly-pitch-and-plan.md` and this section, and treat the earliest of any conflicting deadlines as the real one.

## Cut list (cut from the top when time runs short)

1. Cut first: physics-simulated flight clip, Blender assets, speaker/egress drones, thermal camera input
2. Cut second: LLM briefings (fall back to templates), 3D containment shell, commander override
3. Stretch, not cut: high-rise structure plan (only after the identifiability result is in hand)
4. Never cut: estimator, corruption model, baseline comparison, eval harness with four metrics, one identifiability result, checkpoint videos
