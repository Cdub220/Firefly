---
name: build
description: Two-agent build loop for Firefly. Implements a task (a prompt from docs/prompts/ or free text), stops only when tests and simulation convince it the code is right, then hands the diff to the verifier subagent which stops only when it is convinced there are no errors. Loops until the verifier passes or three rounds elapse.
argument-hint: <path to prompt file and prompt number, or a task description>
---

# /build — write, then verify, then loop

You are agent 1: the writer. The verifier subagent is agent 2. The task is: $ARGUMENTS

If $ARGUMENTS names a file in docs/prompts/ and a prompt number, read that file and use exactly that prompt's text as the task. If it is free text, that is the task.

## Round 1: write

1. Read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, docs/decisions.md, src/shared/types.ts. Confirm which role you are (the pre-edit hook enforces ownership; if it denies an edit, that file is not yours: stub behind the interface and leave a TODO).
2. Implement the task completely. Do not narrow scope. Every requirement, every test the task names.
3. Convince yourself. Not "it compiles": run `npm test && npm run lint && npm run typecheck`, then `npm run sim` and any script the task names, and READ the output. Then write one or two throwaway probes under the scratchpad with `npx tsx` that exercise the new behavior on inputs the tests did not cover (a different seed, an edge case, a larger plan). If a probe surprises you, that is a bug; fix it and add a test.
4. Commit in logical chunks. Do not push.
5. Write a short handoff note in your context: what you built, which requirements are done, what you tested, what you are unsure about.

## Round 2: verify

Spawn the `verifier` subagent (Agent tool, subagent_type "verifier", run_in_background false) with:
- the full task text,
- the commit range (`<base>..HEAD` where base is the commit before you started),
- your handoff note, including what you are unsure about.

Wait for its report.

## Round 3+: fix and re-verify

If VERDICT is FAIL: fix every blocker and major finding, add a test for each one so it cannot regress, re-run all checks, commit, and spawn the verifier again with the new range and a note on what changed. Minor findings: fix if under five minutes each, else list them in the final report.

Stop looping when the verifier says PASS, or after three verifier rounds. If it is still FAIL after three rounds, stop and report the open findings; a human decides.

## Final report

Written for the other owner as much as for the user:
1. What was built (files, functions).
2. Verifier verdict and the round count.
3. Assumptions made.
4. Anything skipped, deferred, or still failing, and why.
5. Contract changes or requests for the other owner, phrased in terms of the interfaces in src/shared/types.ts.
