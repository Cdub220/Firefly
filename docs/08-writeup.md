# 08 · Writeup

The short writeup the final submission requires, in the Defense brief's structure. Every number is sourced from `results/` (`evidence-cp2.json`, `sweep-latest.json`, `identifiability.txt`) and from `docs/05-identifiability.md`, `docs/06-freeze.md` and `docs/07-what-surprised-us.md`. Bracketed TODOs name the command that produces a missing number.

## 1. Question

Can a firefighting drone swarm's decision brain keep an honest picture of a compartment fire inside a large enclosed structure when the fire destroys the sensors that report it?

It matters because the failures are correlated, not random: a compartment that flashes over silences every sensor in it at once, a frozen sensor keeps reporting a plausible old temperature, and smoke blinds the camera exactly where it is hottest. Textbook estimators assume independent noise and, under that kind of structured corruption, converge confidently on the wrong answer. A commander who is told "the fire is here" with 90 % confidence and sends the unit to the wrong floor has been hurt by the estimator, not helped, which is what the brief's four metrics (false certainty, estimation error, time to recovery, computation cost) measure.

## 2. Contribution

- **A failure model** (`src/corruption`): freeze, blind, saturate, flashover and mixed, with a corruption budget k, an onset tick and a target location, exposed as one config type that the chaos panel and the eval harness both read.
- **An estimator** (`src/brain`, frozen at `457de468`) that uses the structure's heat physics as a trusted reference: six consistency rules that distrust readings the physics forbids; candidate burning sets scored by a three-tick rollout with the k largest downward residuals dropped, so up to k liars go undetected without corrupting the answer; a burning set that is the intersection of every surviving hypothesis, the rest reported as an ambiguous set with per-space probabilities; and a confidence that is earned by stability rather than assumed.
- **An allocator** (`src/brain/allocator.ts`) that scores every drone placement by containment value plus information value, splits units across an ambiguous pair, and models its own tethers' suppression in the estimator's rollout.
- **Three baselines on identical observations**: naive, innovation-gated and source-estimating Kalman filters, each with the world's exact heat model.
- **A negative result** (`docs/05-identifiability.md`): a plan whose sensor set provably cannot separate two fires, what it costs, and the one sensor that fixes it.

## 3. Failure model

Every way a reading can be wrong lives in `src/corruption`; the world never lies. **What can fail:** freeze (at onset, up to k sensors stick at their last value with a frozen timestamp, a stale reading that looks live); blind (up to k sensors report ambient with a current timestamp); saturate (every sensor whose true temperature exceeds 300 C pins at exactly 300, no k limit); flashover (a space above 500 C loses every sensor in it, fixed and drone-borne, permanently; drones inside report dead); mixed (all four, freeze and blind sharing k, plus a 2 %-per-tick per-drone comms loss). **Subset:** freeze and blind pick their victims once at onset; saturate and flashover follow the fire, so the corrupted subset grows and is exactly the sensors nearest the truth. **Magnitude:** unbounded. **Correlation:** flashover silences every sensor in a space in one instant, the correlated failure the brief asks about. **What stays trusted:** the plan's geometry, edges and heat-transfer rates, and conservation of heat along them. Drone self-reports may be stale or dropped; the estimator never assumes a command was obeyed. The frozen type is in `docs/06-freeze.md`.

## 4. Evidence

Open loop, demo-6, 60 ticks, 5 seeds, k = 1 (`npm run evidence`); clean run first, because the baselines' headline number is a clean-run number:

| mode | brain | false certainty | at P ≥ 0.9 | coverage | temp error | Brier |
|---|---|---|---|---|---|---|
| none | ours | 0 % | 1 % | 95 % | 0.4 C | 0.043 |
| none | kalman | 65 % | 63 % | 100 % | 2.2 C | 0.130 |
| none | kalman-gated | 67 % | 67 % | 100 % | 18.7 C | 0.139 |
| none | kalman-source | 14 % | 5 % | 94 % | 0.9 C | 0.028 |
| freeze | ours | 0 % | 0 % | 93 % | 4.9 C | 0.067 |
| freeze | kalman | 65 % | 63 % | 100 % | 42.3 C | 0.129 |
| freeze | kalman-gated | 62 % | 66 % | 100 % | 37.4 C | 0.136 |
| freeze | kalman-source | 59 % | 25 % | 46 % | 44.8 C | 0.139 |
| blind | ours | 0 % | 1 % | 93 % | 5.1 C | 0.069 |
| blind | kalman | 72 % | 35 % | 33 % | 122.6 C | 0.184 |
| blind | kalman-gated | 69 % | 58 % | 78 % | 91.3 C | 0.149 |
| blind | kalman-source | 73 % | 34 % | 33 % | 123.3 C | 0.187 |
| flashover | ours | 0 % | 0 % | 93 % | 10.9 C | 0.078 |
| flashover | kalman | 64 % | 63 % | 100 % | 12.9 C | 0.130 |
| flashover | kalman-gated | 62 % | 67 % | 100 % | 23.2 C | 0.138 |
| flashover | kalman-source | 2 % | 48 % | 24 % | 151.9 C | 0.447 |

The two most informative rows of the frozen sweep (`results/sweep-latest.json`, 10 seeds, 120 ticks):

```
plan         mode       k   target    brain          falseCert  fc@P.9  coverage  wrongDisp   err C              ttr  ms/tick
vessel-3x8   freeze     1   ignition  ours                  0%      8%       93%        10%     1.8     83.1 (10/10)     1.70
vessel-3x8   freeze     1   ignition  kalman               97%     97%      100%        97%    16.1     never (0/10)     0.40
vessel-3x8   freeze     1   ignition  kalman-gated         94%     97%      100%        97%    65.5     never (0/10)     0.33
vessel-3x8   freeze     1   ignition  kalman-source        86%     47%       49%        49%    11.7     71.7 (10/10)     0.92

demo-6       blind      1   ignition  ours                  0%      1%       98%         8%     4.2     29.0 (10/10)     0.08
demo-6       blind      1   ignition  kalman               79%     62%       75%        62%   103.5     29.0 (10/10)     0.03
demo-6       blind      1   ignition  kalman-gated         78%     78%       91%        79%   110.7     never (0/10)     0.02
demo-6       blind      1   ignition  kalman-source        79%     60%       75%        60%   100.4     29.0 (10/10)     0.04
```

**Where ours loses**, verbatim from the sweep: nine cells, all saturate with a random target, on wrong dispatch only:

```
  demo-6 saturate k=1 target=random: wrongDispatch 49% > kalman-source 7% | coverage ours 88% vs 55%, err 304.5 vs 310.0
  demo-6 saturate k=2 target=random: wrongDispatch 49% > kalman-source 7% | coverage ours 88% vs 55%, err 304.5 vs 310.0
  demo-6 saturate k=3 target=random: wrongDispatch 49% > kalman-source 7% | coverage ours 88% vs 55%, err 304.5 vs 310.0
  vessel-3x8 saturate k=1 target=random: wrongDispatch 46% > kalman-source 21% | coverage ours 89% vs 49%, err 314.2 vs 317.2
  vessel-3x8 saturate k=2 target=random: wrongDispatch 46% > kalman-source 21% | coverage ours 89% vs 49%, err 314.2 vs 317.2
  vessel-3x8 saturate k=3 target=random: wrongDispatch 46% > kalman-source 21% | coverage ours 89% vs 49%, err 314.2 vs 317.2
  tower-5x4 saturate k=1 target=random: wrongDispatch 41% > kalman-source 23% | coverage ours 87% vs 45%, err 300.9 vs 306.4
  tower-5x4 saturate k=2 target=random: wrongDispatch 41% > kalman-source 23% | coverage ours 87% vs 45%, err 300.9 vs 306.4
  tower-5x4 saturate k=3 target=random: wrongDispatch 41% > kalman-source 23% | coverage ours 87% vs 45%, err 300.9 vs 306.4
```

Diagnosis (`docs/06-freeze.md`): saturate with a random target pins every hot sensor at exactly 300 C, the readings stop carrying information, and the forced-space rule keeps burned-out spaces in the set until the assumed fuel budget runs out; the source filter says less (coverage 45 to 55 % against 87 to 89 %) and so is wrong less. Ours' scalar false certainty is 0 % in every cell; on P(burning) at 0.9 it is 2 to 15 % as plan-by-mode means and up to 49 % in the worst cell (demo-6, flashover, random target), which fails pre-registered expectation 1 on the random-target family and is reported as such. Held-out families on fresh seeds: [TODO: `npm run sweep -- --plans demo-6,vessel-3x8,tower-5x4 --targets ignition,neighbor,far --k 1 --seeds 101..120 --ticks 120` and `--targets random --k 1,2,3 --seeds 101..120`; paste the WHERE OURS LOSES block].

## 5. Negative result

On `ident-7`, a seven-space plan whose two wings are mirror images with fixed sensors only on the passage between them, a fire in either wing gives the same reading at every sensor, exactly (difference 0.0 C against a 4 C threshold, twice the noise the estimator assumes and eight times the simulator's). No estimator can distinguish H1 from H2 with this sensor set, because swapping the two wings is a symmetry of the plan that fixes every sensor, so the two fire states produce identical measurement vectors and any choice between them is a coin toss, whatever the algorithm. Ours reports both wings as ambiguous at confidence 0.14 with 0 % false certainty; the naive Kalman names neither wing at confidence 0.85 and then the passage; closed loop the ambiguity costs 104 drone-ticks parked in the empty wing; one fixed sensor in a wing resolves it and one corruption of that sensor takes the resolution away. Full construction, proof, cost and generalization in `docs/05-identifiability.md`; numbers from `npm run ident`.

## 6. Assumptions and limits

The heat model is linear: per-edge transfer at the plan's rates, generation as a pull toward a 900 C flame temperature, first-order ambient loss; hypotheses are scored on a three-tick rollout rather than at steady state, and steady state is used only for the allocator's information value. k is known as a budget, not learned. There is no smoke model: blinding is modelled as a reading, not as a medium. Sensor noise in the simulator is Gaussian with a 0.5 C standard deviation; the estimator and the baselines assume 2 C, a deliberate margin. All plans are synthetic JSON files; the world is the team's own simulator, so "physics as a trusted reference" is true by construction except in the mismatch probe (`npm run probe:mismatch`): with the brain's edge rates wrong by ±30 % (seed 1) ours' false certainty stays 0 %, its error moves by at most 0.2 C and wrong dispatch by at most two points; at ±50 % (seed 7, the pre-registered H3 seed) false certainty is still 0 % in every cell, the largest error movement is 0.8 C (demo-6, downward) and wrong dispatch moves by at most two points. Omitted nonlinear effects: radiative transfer, buoyancy and stack flow as a directional process (edges are symmetric), fuel-limited combustion chemistry, ventilation-controlled burning, door and hatch dynamics beyond open/closed, and sensor response lag. The brain caps tethers per space at two. Nothing here is deployment-ready; it is a decision-brain prototype on a simulator.

## 7. What changed in our understanding

Condensed from `docs/07-what-surprised-us.md`. The Kalman baseline's 65 % false certainty is a clean-run number: its burning rule is "above 200 C", and a burned-out or neighbour-heated space is hot without burning, so the headline measures hot-versus-burning separation; corruption resistance lives in the temperature-error and coverage columns (naive 2.2 C clean to 123 C under blind on the evidence run; ours 0.4 to 5.1 C). Innovation gating, the practitioner's defence, does not help (62 to 69 % against 64 to 72 %) and makes the filter a worse thermometer. A source-estimating filter fixes the clean run (14 %) and is the strongest baseline, but is as fooled under freeze and blind and loses the fire under flashover (coverage 24 %). The closed loop exposed that the estimator had no model of its own water: the burning set flipped 14 to 36 times per run and drones died; teaching the rollout the tethers' suppression took the flips to zero and erased an apparent "sooner and less water" that was the defect's artefact. And the negative result is a symmetry argument about sensor placement, not something an estimator can fix.

## 8. Next test

The single experiment most likely to change the conclusion is adversarial corruption chosen with knowledge of the estimator: an attacker who reads `src/brain` and picks which k sensors to freeze, at what value and when, to keep every hypothesis within the 8 C tolerance while the true fire moves (the sweep's random target is unlucky, not hostile). The second is a real building's alarm-panel layout as a plan file, with its actual sensor placement and its actual unsensored interiors, run through `npm run ident`'s symmetry check before any estimator is run at all. Both are freeze-legal: new inputs, not new method. [TODO: neither has been run; the adversarial mode needs a new `CorruptionMode` in `src/corruption` and a real layout needs a plan file, then `npm run sweep -- --modes adversarial` and `npm run ident` on it.]

## 9. Reproduce

```
npm install
npm test            # 333 tests, including the freeze test against hash 457de468
npm run evidence    # results/evidence-cp2.json, the table in section 4
npm run sweep -- --plans demo-6,vessel-3x8,tower-5x4   # results/sweep-latest.json, ~6 min
npm run ident       # results/identifiability.txt
npm run hedge       # results/hedge-cp4.txt
npm run brief -- --plan vessel-3x8 --mode flashover --seed 7 --ticks 120
npm run probe:mismatch -- --scale 0.3 --seed 1 --plans demo-6,vessel-3x8
```

Node 22, no network: nothing in the demo or the evaluation depends on a live API call.

## 10. External work

- H. Fawzi, P. Tabuada and S. Diggavi, "Secure Estimation and Control for Cyber-Physical Systems Under Adversarial Attacks," IEEE Trans. Automatic Control, 2014: the y = Hx + a sparse-corruption framing and the bound on how many corrupted sensors an estimator can tolerate; our k is that budget (its default value came from per-space sensor redundancy, `docs/decisions.md` Sat hour 5).
- R. E. Kalman, "A New Approach to Linear Filtering and Prediction Problems," 1960: the baselines; the graph Laplacian process model and the augmented-state source filter are textbook applications.
- mulberry32 (T. Ettinger), the seeded 32-bit PRNG behind `makeRng`, forked per subsystem so seed-matched comparisons hold.
- Libraries (`package.json`): React 19.2, @react-three/fiber and drei, three, zustand, Tailwind 4, Vite 6, vitest 3, tsx, TypeScript 5.8, ESLint 9 with typescript-eslint.
