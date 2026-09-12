# Prompts

One file per person per checkpoint. Each file has 2–3 prompts meant to be run in order, each in a fresh Claude Code session (Fable). Every prompt is self-contained: it tells the agent what to read, what to build, which files it may touch, what "done" means, and what to report.

Usage: open a new session in the repo root and paste one prompt. Or type: `Read docs/prompts/dean/checkpoint-1.md and do Prompt 1.`

| | Dean | Chase |
|---|---|---|
| Index | [dean-prompts.md](dean-prompts.md) | [chase-prompts.md](chase-prompts.md) |
| CP1 · hour 8 · Sat 8 PM ET | [dean/checkpoint-1.md](dean/checkpoint-1.md) | [chase/checkpoint-1.md](chase/checkpoint-1.md) |
| CP2 · hour 16 · Sun 4 AM ET | [dean/checkpoint-2.md](dean/checkpoint-2.md) | [chase/checkpoint-2.md](chase/checkpoint-2.md) |
| CP3 · hour 24 · Sun 12 PM ET | [dean/checkpoint-3.md](dean/checkpoint-3.md) | [chase/checkpoint-3.md](chase/checkpoint-3.md) |
| CP4 · hour 32 · Sun 8 PM ET | [dean/checkpoint-4.md](dean/checkpoint-4.md) | [chase/checkpoint-4.md](chase/checkpoint-4.md) |
| CP5 · hour 40 · Mon 4 AM ET | [dean/checkpoint-5.md](dean/checkpoint-5.md) | [chase/checkpoint-5.md](chase/checkpoint-5.md) |

Every prompt starts with the same preamble so the agent loads context and respects boundaries. If you write a new prompt, copy it:

```
You are working in the Firefly repo as <Dean|Chase>. Before anything else read CLAUDE.md,
docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory
ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking
questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not
report done unless all three are green. Commit in logical chunks with clear messages. Do
not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that
did not work or that you skipped, (4) any contract change you need from the other owner.
```

Debugging after a prompt lands at 80%: paste the failing output back into the same session and say what you expected. Do not start a new session for a fix; the context is worth more than a clean slate.
