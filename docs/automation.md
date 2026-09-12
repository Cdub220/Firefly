# Automation: hooks, skills, agents, CI

Everything here lives in the repo and applies to both owners automatically on `git pull`. Nothing needs installing beyond `npm install`.

## Role detection

A Claude Code session knows whose it is from `git config user.name`: `deanyao6` is Dean, `cdub` is Chase. Override with `FIREFLY_ROLE=dean`, `chase`, or `both` in the environment. `both` disables the ownership guard for a session where one person is deliberately working across the seam. Logic in `.claude/hooks/role.sh`.

## Hooks (`.claude/settings.json`)

| Event | Script | What it does |
|---|---|---|
| PreToolUse on Edit/Write | `pre-edit-guard.sh` | Denies edits to the other owner's directories. Asks the human before any edit to `src/shared/types.ts` or `src/loop.ts`. Denies edits to frozen estimator and corruption files once `docs/06-freeze.md` exists. |
| PostToolUse on Edit/Write | `post-edit-check.sh` | After any `.ts`/`.tsx` edit under `src/`, runs eslint on that file and tsc on the project. Errors go straight back to the agent. |
| Stop | `stop-gate.sh` | If `src/` or `data/` differs from HEAD, runs test, lint, typecheck. Red means the agent is told to keep working. Allows the stop after three consecutive blocks so a pre-existing failure cannot trap a session. |

Ownership map used by the guard: Dean = `src/brain`, `src/corruption`, `src/eval`. Chase = `src/world`, `src/ui`, `data/structures`, `src/main.tsx`, `index.html`. Contract = `src/shared/types.ts`, `src/loop.ts`. Everything else (docs, config, `src/shared/*` other than types) is shared.

If a hook seems not to fire after pulling, open `/hooks` once in Claude Code to reload, or restart the session.

## Skills (slash commands, `.claude/skills/`)

| Command | Purpose |
|---|---|
| `/dean` | Loads Dean's context, infers progress from repo state, checks the clock against the schedule, reports what Chase landed, proposes the next prompt. `/dean <task>` skips the proposal and runs `/build` on it. |
| `/chase` | Same for Chase. |
| `/build <prompt file + number, or task>` | The two-agent loop. Agent 1 implements and stops only when tests and simulation convince it. Agent 2 (the `verifier` subagent) reviews adversarially and stops only when convinced there are no errors. Loops up to three rounds. |
| `/checkpoint N` | Runs all checks and the checkpoint's result scripts, drafts `docs/checkpoints/cpN.md` with what exists, the 60-second video script, submission notes, and an honest rubric self-score. Tags the commit `cpN`. |

The intended session shape: `/dean` (or `/chase`) to orient, `/build docs/prompts/dean/checkpoint-1.md prompt 1` to do the work, `/checkpoint 1` when it is time to submit.

## Agents (`.claude/agents/`)

`verifier`: read-only on source, may run commands. Diffs the change against the task, runs everything, writes throwaway probes under the scratchpad to break determinism, boundaries, truth leaks, physics sanity, and estimator sanity, grades the tests, and returns PASS or FAIL with findings ranked by severity. A PASS requires every requirement done and no blocker or major findings.

## CI (`.github/workflows/ci.yml`)

On every push to `main` and every PR: `npm ci`, test, lint, typecheck, build on Node 22. A red badge on the README means someone pushed past the stop gate with `FIREFLY_ROLE=both` or edited outside Claude Code.

## Not automated, on purpose

- Pushing. Agents commit; humans push. The prompts say "do not push."
- The freeze itself. `/checkpoint 3` does not create `docs/06-freeze.md`; Dean's checkpoint-3 prompt 3 does, and a human runs it.
- Contract edits. The guard asks; it does not decide.
