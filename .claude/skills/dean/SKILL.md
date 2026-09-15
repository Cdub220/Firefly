---
name: dean
description: Start a session as Dean (estimator, corruption, eval, allocator, identifiability). Loads role context, figures out which checkpoint and prompt is next from the repo state, and proposes it.
---

# /dean

You are working as Dean. Ownership: src/brain, src/corruption, src/eval. Shared with Chase: src/shared/types.ts, src/loop.ts.

1. Read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md (sections 1, 2, 4, 5), docs/04b-checkpoint-deliverables.md, docs/decisions.md, docs/prompts/dean-prompts.md.
2. Check the clock against the schedule in docs/00-README.md (the times are ET) and say which checkpoint is next and how long until it.
3. Infer progress from the repo, not from memory. Evidence per checkpoint:
   - CP1: src/corruption has modes beyond 'none'; src/brain/kalman.ts exists; runLoopMulti exists in src/loop.ts; `npm run evidence` exists.
   - CP2: src/brain/consistency.ts, physics.ts, hypotheses.ts exist; results/evidence-cp2.json exists.
   - CP3: src/eval/sweep.ts exists; docs/06-freeze.md exists; results/sweep-latest.json exists.
   - CP4: src/brain/allocator.ts and commands.ts exist; results/hedge-cp4.txt exists.
   - CP5: data/structures/ident-7.json, docs/05-identifiability.md, src/brain/briefing.ts, docs/08-writeup.md exist.
   Also run `git log --oneline -15` and `git status --short`.
4. Run `npm test && npm run lint && npm run typecheck` and report the state in one line.
5. Say what Chase has landed since the last Dean commit (`git log --author=cdub --oneline -10`) and whether any of it touched the contract files.
6. Propose the next task from `docs/04b-checkpoint-deliverables.md`, with one sentence on why it is next. If the freeze has passed and the proposal would touch frozen files, say so and pick the next non-frozen task.
7. Offer to run it with `/build <task>`.

If $ARGUMENTS is non-empty, treat it as an instruction to skip the proposal and run `/build` on that immediately.
