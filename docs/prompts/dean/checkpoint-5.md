# Dean · Checkpoint 5 · hour 40 · Mon 4:00 AM ET

**Goal.** The negative result. A specific pair of fire states that our sensor set provably cannot distinguish under the stated failure model, the operational cost of that ambiguity, and the one extra observation that resolves it. The Defense brief says this can be the strongest kind of result and almost no team will bring one. Protect the time for Prompt 1. Prompts 2 and 3 are cheaper and can be cut.

---

## Prompt 1 · The identifiability result

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: The estimator is frozen. src/brain/physics.ts has steadyState(plan, burning).
The failure model (docs/06-freeze.md) allows up to k sensors to be frozen or blinded, and
flashover removes every sensor in a space above flashoverTemp. The brain scores hypotheses
by dropping the k largest residuals.

TASK: construct, prove, demonstrate, and resolve one specific indistinguishable pair.

CONSTRUCTION. Write data/structures/ident-7.json: a plan built so that two burning sets
H1 and H2 produce identical steady-state temps at every sensor location once k sensors
are allowed to be corrupted. The clean way is symmetry: a central passage P with sensors,
and two mirror-image wings A1-A2 and B1-B2 hanging off it with identical edge rates,
where A2 and B2 have sensors but A1 and B1 do not (interior spaces without a fixed sensor
are realistic). H1 = {A1}, H2 = {B1}. Use steadyState to verify: temps at every sensored
space under H1 equal those under H2 by symmetry. If they are not exactly equal, adjust
rates until they are within noise sigma. Keep it small (6 to 9 spaces) so the proof fits
on a slide.

PROOF. Write src/eval/identifiability.ts, run by `npm run ident`, that:
  1. Loads ident-7.json, computes steadyState for H1 and H2, prints the temp at every
     sensor under each, and prints max |difference| over sensors. If that max is below
     2 * sigma (sigma = 2C sensor noise), the pair is indistinguishable by ANY estimator
     using these sensors, not just ours, because the measurement vectors differ by less
     than the noise. State this in the printed output in one sentence.
  2. Also handle the k-corruption version: with k=1, find the sensor whose removal makes
     the two hypotheses' residual vectors identical, and print it. That is the sensor an
     adversarial (or just unlucky) freeze would need to hit.
  3. Run runLoopMulti with truth = H1 (set ignition in the plan to A1) for both brains,
     mode 'none' and mode 'freeze' on the sensor from step 2, and print: does kalman pick
     H1 or H2 and with what confidence; does ours report A1 | B1 as ambiguous and with
     what confidence. The desired outcome: kalman commits (sometimes wrongly), ours hedges.
     Print wrongDispatch for both.
  4. OPERATIONAL COST: with the allocator on, how many drone-ticks are spent covering both
     wings versus one, and what is the containment count at tick 60 versus the same run
     with the resolving sensor added (step 5)? Print both.
  5. RESOLUTION: write data/structures/ident-7-fixed.json, identical except one added
     fixed sensor in A1. Re-run steps 1 and 3: max difference now large, ours converges to
     a single hypothesis, print the tick at which it does. That is "the one extra
     observation that resolves it."
Print everything as a plain-text report and save it to results/identifiability.txt.

WRITEUP: docs/05-identifiability.md. Structure: the plan (ASCII diagram), the two
hypotheses, the measurement-vector table from step 1, the sentence "no estimator can
distinguish these with this sensor set, because...", the k=1 sensor, what the baseline
does, what ours does, the operational cost in drone-ticks and containment, and the fix.
Under a page. Numbers from results/identifiability.txt. Then a short generalization
paragraph: this is a symmetry argument, so any structure with two spaces that are
equivalent under a graph automorphism fixing the sensor set is affected; sensor placement
must break every such symmetry, which is a placement criterion, not an estimator fix.

TESTS: src/eval/identifiability.test.ts asserts steadyState(H1) and steadyState(H2) agree
at every sensor within 2 * sigma on ident-7.json, and disagree at the added sensor on
ident-7-fixed.json.

DO NOT TOUCH: src/world, src/ui, src/corruption, frozen estimator files. New plan files
are yours to add; register them in src/shared/structures.ts and tell Chase so the
scenario picker shows them.
```

---

## Prompt 2 · Briefings, templated, no live API

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: Belief has estimate, burningSet, ambiguous, suspectSensors, confidence. Commands
have task strings. The final demo may not depend on any live API call.

TASK: src/brain/briefing.ts exporting briefing(plan, belief, commands, t): string that
produces a 2 to 4 sentence incident-commander summary from templates. No LLM call.
Example of the voice:
  "t=42. Fire confirmed in S3 and S2. Cannot rule out S4; sensor F4 is frozen and S4
   shares an open door with S3. Splitting scouts D1 to S4 and D2 to S5. Tether D3 holding
   S3. 4 occupants in S4; recommend crew priority there."
Rules: lead with the certain set; then each ambiguous group with the reason (from
suspectSensors if available, else "no trusted reading"); then commands grouped by task;
then the highest-occupancy or highest-hazard space in the uncertain set as a
recommendation. Deterministic. Unit test three belief shapes.

Wire it as an optional field briefing?: string on the step() return (additive contract
change to the Brain interface in src/shared/types.ts; tell Chase, he will render it). Put
the call in src/brain/commands.ts (the unfrozen hook file from checkpoint 4) so no frozen
file changes.

DO NOT TOUCH: src/world, src/ui, src/corruption, frozen estimator logic.
```

---

## Prompt 3 · Writeup skeleton

```
You are working in the Firefly repo as Dean. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Chase.

CONTEXT: results/ has sweep-latest.json, evidence-cp2.json, hedge-cp4.txt,
identifiability.txt. docs/ has 05-identifiability.md, 06-freeze.md, 07-what-surprised-us.md.

TASK: write docs/08-writeup.md, the short writeup the final submission requires, in the
structure the Defense brief asks for. Fill every section from the files above; where a
number is missing, put a bracketed TODO with the exact command that produces it.

Sections, in order, each under 200 words:
  1. Question. One sentence. Why it matters, three sentences, with the correlated-failure
     framing.
  2. Contribution. Exactly what we built: failure model (list modes), estimator (physics
     reference, consistency rules, hypothesis sets with k-residual dropping, honest
     confidence), allocator (joint containment + information), and the identifiability
     result.
  3. Failure model. Copy from README, tightened.
  4. Evidence. The sweep table for the two most informative rows, false certainty and
     coverage side by side, ours vs kalman. The WHERE OURS LOSES rows with diagnosis.
  5. Negative result. Three sentences and a pointer to docs/05.
  6. Assumptions and limits. Linear heat model; steady-state blending; k known as a
     budget; no smoke model; sensor noise Gaussian; plans synthetic; not deployment-ready.
     Say which nonlinear effects are omitted.
  7. What changed in our understanding. Condensed from docs/07.
  8. Next test. The single experiment that would most change our conclusion. Suggest:
     adversarial corruption chosen with knowledge of the estimator, and a real building
     alarm-panel layout as a plan file.
  9. Reproduce. The commands: npm install, npm test, npm run sweep, npm run ident,
     npm run hedge.
 10. External work. Fawzi, Tabuada and Diggavi on secure estimation; the Kalman filter;
     mulberry32; the libraries in package.json.

DO NOT TOUCH: any src/ file.
```
