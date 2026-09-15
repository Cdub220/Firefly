---
name: chase
description: Start a session as Chase (world simulation, structure plans, UI). Loads role context, figures out which checkpoint and prompt is next from the repo state, and proposes it.
---

# /chase

You are working as Chase. Ownership: src/world, src/ui, data/structures. Shared with Dean: src/shared/types.ts, src/loop.ts.

1. Read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md (sections 1, 3, 4, 5), docs/04b-checkpoint-deliverables.md, docs/decisions.md, docs/prompts/chase-prompts.md.
2. Check the clock against the schedule in docs/00-README.md (the times are ET) and say which checkpoint is next and how long until it.
3. Infer progress from the repo, not from memory. Evidence per checkpoint:
   - CP1: src/world/physics.ts and drones.ts exist; `npm run sim` shows the truth burning set growing.
   - CP2: data/structures/vessel-3x8.json and tower-5x4.json exist; src/world/gen.ts; src/shared/structures.ts; src/ui/Scene.tsx and layout.ts.
   - CP3: src/ui/panels/ScenarioPanel.tsx and ChaosPanel.tsx; src/ui/corruptionSchema.ts.
   - CP4: drone rendering in the scene; src/ui/SplitView.tsx.
   - CP5: src/ui/CompareView.tsx; recording mode; docs/09-generality.md.
   Also run `git log --oneline -15` and `git status --short`.
4. Run `npm test && npm run lint && npm run typecheck` and report the state in one line.
5. Say what Dean has landed since the last Chase commit (`git log --author=deanyao6 --oneline -10`) and whether any of it touched the contract files or CorruptionConfig (which the chaos panel is generated from).
6. Propose the next task from `docs/04b-checkpoint-deliverables.md`, with one sentence on why it is next.
7. Offer to run it with `/build <task>`.

If $ARGUMENTS is non-empty, treat it as an instruction to skip the proposal and run `/build` on that immediately.
