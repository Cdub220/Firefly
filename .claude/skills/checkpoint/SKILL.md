---
name: checkpoint
description: Prepare a checkpoint submission for Firefly. Runs all checks and the relevant result scripts, gathers what changed, and drafts docs/checkpoints/cpN.md with what exists, a 60-second video script, and submission notes.
argument-hint: <checkpoint number 1-5>
---

# /checkpoint N

N = $ARGUMENTS. If empty, infer from the clock and docs/00-README.md.

1. Read docs/04b-checkpoint-deliverables.md for checkpoint N's goal, video message, and definition of done. Read docs/03-team-playbook.md section 5 for the rubric.
2. Run `npm test && npm run lint && npm run typecheck && npm run build`. If anything is red, stop and report; a checkpoint with a red build is worse than a late one by ten minutes.
3. Run the result scripts that exist for this checkpoint and capture output:
   - CP1: `npm run sim`, `npm run sim:freeze`, `npm run evidence`
   - CP2: `npm run evidence`
   - CP3: `npm run sweep -- --quick` (full sweep if under 5 minutes)
   - CP4: `npm run hedge`
   - CP5: `npm run ident`
   Skip any that do not exist and say so.
4. Gather what changed: `git log --oneline` since the previous checkpoint's tag (tags are `cp1`, `cp2`, ... ; if none, since the start). Group by owner.
5. Write docs/checkpoints/cpN.md (create the directory) with:
   - **What exists now.** Three to six bullets, each verifiable by a command or a file.
   - **The number.** The single most important quantitative result from step 3, with the command that reproduces it. If there is no number yet, say what the number will be.
   - **Video script, 60 seconds.** Three beats with rough timings: the question or claim (15s), the evidence on screen (35s), what is next (10s). Written to be read aloud. Plain sentences. It must say what changed in our understanding since the last checkpoint, because the brief asks for that.
   - **Submission notes.** Repo link, commit hash, what changed since last checkpoint, where feedback would help (the brief asks for this too), known gaps stated by us before a judge finds them.
   - **Definition of done check.** Each item from docs/04b for this checkpoint marked done / not done with evidence.
   - **Rubric self-score.** One line each for Innovation, Technical, Business Value, Presentation with a 1–10 and a reason. Be honest; this is for us.
6. Tag the commit: `git tag cpN` (do not push tags unless asked).
7. Print the video script and the submission notes in the final message so they can be copied straight into the form.
