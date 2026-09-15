# Firefly

Hackathon project (East v. West AllStar Hack, Defense track, Sept 12–14 2026). Team: Dean and Chase.

**Before doing any work in this repo, read `docs/00-README.md`, then `docs/04-who-does-what.md`, then `docs/decisions.md`.** The first is what we are building and why. The second is who owns which directory, how to build each piece, and how the halves fit together. The third is why things are the way they are. Per-checkpoint goals are in `docs/04b-checkpoint-deliverables.md`.

Key rules that apply to all code:

- Structure is data, not code. No ship-specific names in types or logic. Structure plans are JSON with per-edge heat-transfer rates.
- The estimator must never see the true corruption pattern. Keep the corruption injector and the estimator decoupled.
- Method freeze is at hour 36 (Mon Sept 14, 12:00 AM ET, i.e. Sunday midnight). After the freeze, do not change estimator logic. Eval cases are chosen after the freeze.
- Nothing in the final demo may depend on a live API call.
- Never cut: estimator, corruption model, Kalman baseline, eval harness (false certainty, estimation error, time to recovery, compute cost), one identifiability result, checkpoint videos.

Automation: hooks enforce ownership, contract edits, and the freeze; the stop gate runs test/lint/typecheck. Skills: `/dean`, `/chase`, `/build`, `/checkpoint`. Subagent: `verifier`. See `docs/automation.md`. If a hook denies an edit, do not work around it; the message says what to do instead.
