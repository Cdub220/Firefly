# Firefly

Hackathon project (East v. West AllStar Hack, Defense track, Sept 12–14 2026). Team: Dean and Chase.

**Before doing any work in this repo, read `docs/00-README.md`.** It is the shared context for both of us and for every coding agent. It links to the full pitch/plan, the track brief, and the event playbook.

Key rules that apply to all code:

- Structure is data, not code. No ship-specific names in types or logic. Structure plans are JSON with per-edge heat-transfer rates.
- The estimator must never see the true corruption pattern. Keep the corruption injector and the estimator decoupled.
- Method freeze is at hour 24 (Sun Sept 13, 12:00 PM ET). After the freeze, do not change estimator logic. Eval cases are chosen after the freeze.
- Nothing in the final demo may depend on a live API call.
- Never cut: estimator, corruption model, Kalman baseline, eval harness (false certainty, estimation error, time to recovery, compute cost), one identifiability result, checkpoint videos.
