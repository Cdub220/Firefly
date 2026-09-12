# Defense Track Brief — Resilient estimation for critical infrastructure

East v. West AllStar Hack | September 12 to 14 2026

Source PDF: `docs/source/08-Defense-Challenge-Briefing.docx.pdf`

## Why this problem matters

A critical system must make decisions from imperfect information. Measurements can be delayed, missing, or systematically wrong. During a disruption, several failures may occur together, and a report that looks plausible in isolation may contradict the rest of the system. A decision-maker needs to know both the estimated state and whether that estimate is actually supported by the surviving observations.

This is an observability and error-correction problem. If two different physical states, each paired with an allowed pattern of corrupted sensors, produce the same measurements, no estimator can reliably distinguish them without additional information. More computation does not remove that ambiguity. The location and structure of measurements can matter as much as their number. Secure estimation research provides a formal starting point for reasoning about corrupted observations [1].

The challenge applies these questions to resilience and continuity of essential infrastructure. Examples include estimating the state of a power network, locating a water-system failure, or reconciling inconsistent emergency supply reports. Work in a synthetic, public, or authorized environment. The goal is to improve detection, recovery, and decision quality when information becomes unreliable.

## The challenge

Develop an estimator, protocol, or design method that preserves useful knowledge of a critical system under a defined class of measurement and communication failures. **Specify what can fail, how failures may be correlated, what information remains trusted, and what state or decision must be recovered.**

You may derive a recoverability bound, optimize sensor placement, build a robust estimator, compare recovery strategies, or construct a simulation that exposes a hidden failure mode. A proof of impossibility can be a strong result if it precisely identifies the missing information and suggests how to obtain it. **Do not assume the true failure pattern is known to the estimator unless that is an explicit part of the problem.**

## Research directions and ways to begin

### Research directions

Study sparse error correction in dynamical systems, resilient consensus, robust Bayesian filtering, or sensor placement for identifiability. Derive how many corrupted observations can be tolerated for a given measurement graph. Investigate whether conservation laws can identify inconsistent reports. Examine uncertainty propagation when observations arrive out of order.

### Mathematical starting point

Consider `y = Hx + a + epsilon`, where `x` is system state, `a` is a structured corruption vector, and `epsilon` is ordinary noise. Define the allowed support or magnitude of `a`. Determine whether distinct state-corruption pairs generate identical observations. Extend to time-varying dynamics only after stating what temporal information adds.

### An example of a focused contribution

For example, analyze a small infrastructure network where a limited subset of sensors can report arbitrary values. Find the sensor arrangements that permit unique state recovery and test an estimator near that limit. Compare with a method that assumes ordinary independent noise, then show where that assumption breaks.

### What would make the evidence convincing

**Evaluate against failures selected after the method is fixed.** Vary corruption location, correlation, and network connectivity. **Report false certainty, estimation error, time to recovery, and computation cost.** If a guarantee assumes independent failures or bounded attackers, show what happens outside those assumptions.

### Freedom in the final output

Choose the format that best demonstrates the contribution: a model, simulation, mathematical result, experiment, design, notebook, prototype, or application. You may narrow the question or challenge its premise. The directions in this document are options, not a feature checklist. The scope should be ambitious enough to expose a real uncertainty and narrow enough to support a defensible result.

### How to make progress during the event

Begin with a precise question and a baseline, reference calculation, or competing explanation. Use successive 12-hour updates to show the current artifact and what changed in your understanding. A result that fails under a difficult case is useful if you diagnose the failure and revise the claim. Finish with the result, its evidence, its limits, and the next experiment or implementation step.

## Frequently asked questions

**Does the project need a military application?**
No. Critical infrastructure resilience and emergency operations are suitable applications. The technical contribution should concern operation under difficult failure conditions. Keep the demonstration focused on defensive analysis, recovery, and continuity.

**What is the difference between noise and corruption?**
Noise follows the stochastic assumptions in your model. Corruption can be biased, coordinated, or arbitrary within a stated constraint. A method that works for small independent noise may fail against structured bad measurements. Define the distinction explicitly.

**How strong should the failure model be?**
Strong enough to reflect the scenario, but precise enough to analyze. Specify whether failures affect a fixed or changing subset, whether their magnitude is bounded, and whether they can coordinate. There is no meaningful resilience guarantee without such assumptions.

**Can we use only a linear model?**
Yes. A linear model can reveal a substantial identifiability or algorithmic result. Explain where it approximates the physical system and which nonlinear effects it omits. Do not claim general physical resilience from a model that excludes the relevant failure dynamics.

**What if the system cannot recover the exact state?**
It may still return a justified set of possible states or support a conservative decision. Evaluate the usefulness and coverage of that uncertainty set. False precision can be worse than a correctly identified ambiguity.

**How do we evaluate without real incidents?**
Use controlled simulated failures with known ground truth, including cases selected after development. Vary sensor locations and correlations. Real data can supplement this, but the simulation should make its assumptions visible and distinguish tested behavior from deployment readiness.

**What makes a negative result useful?**
Identify a specific ambiguity or lower bound and show its practical consequence. Then examine whether another sensor, a trusted reference, a temporal observation, or a different protocol resolves it. A general statement that infrastructure is vulnerable is insufficient.

## Submission guidance and research resources

### What to include

Explain the question, why it matters, and the exact contribution. Include the artifact or technical result, enough evidence for another team to inspect or reproduce it, and a clear account of assumptions and limitations. Identify external code, models, datasets, and prior research. Describe the next test that would most strengthen or change your conclusion.

### Match the evidence to the claim

Prediction requires independent evaluation. Simulation requires checks on numerical behavior and model assumptions. A theoretical claim requires a proof or a carefully stated argument, with counterexamples where relevant. Hardware claims need operating conditions and measurements. Design claims need quantities and constraints. Use the form of evidence appropriate to the work, rather than trying to fit every submission into an application demo.

### Checkpoint schedule (as stated in the track brief)

- Saturday September 12 at 10 p.m. ET: first progress submission.
- Sunday September 13 at 10 a.m. and 10 p.m. ET: updated versions.
- Monday September 14 at 10 a.m. ET: final progress checkpoint.
- Monday September 14 at noon ET: final submission under the current event schedule.

These checkpoints accept the current state of your work, including incomplete models, derivations, or designs. Explain what changed and where feedback would help. The current Saturday 10 a.m. to Monday noon schedule provides 50 hours.

> Note: this schedule differs from both the Playbook (12-hour cadence, 72 hours) and our own plan (8-hour cadence, 49 hours, ending Mon 1:00 PM ET). See `docs/00-README.md` for how we reconcile these.

### Evaluation

The track guidance helps interpret the existing event rubric; it does not introduce new scoring weights. Technical depth means resolving a difficult uncertainty with sound reasoning and evidence. Novelty, significance, and clarity matter alongside implementation. A rigorous negative result can be valuable, and a polished interface alone does not establish the underlying claim.

### Starting resources

1. Secure estimation and control under adversarial attacks (Fawzi, Tabuada, Diggavi — the standard reference for the `y = Hx + a` sparse-corruption setting)

Readings provide context, not a promise of data access or institutional endorsement. Verify access and license conditions before committing to a dataset. Public or simulated data are acceptable when their limits are explicit. Use any tools you can access under their applicable terms.
