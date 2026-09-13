# 05 · Identifiability: two fires the sensors cannot tell apart

Numbers from `results/identifiability.txt` (`npm run ident`, seed 1, 60 ticks). Plans in `data/ident/`.

## The plan

```
   A2 --door-- A1 --bulkhead-- P --bulkhead-- B1 --door-- B2
                               |
                            passage
                               |
                               Q --door-- R (resupply)
                           [FP] [FQ] [FR] fixed sensors
```

`ident-7`: seven spaces. A central passage P with two mirror-image wings, A1–A2 and B1–B2, hung off it through identical bulkheads (rate 0.05) and doors (0.15). Q and R lead away from P. Fixed sensors sit in P, Q and R only; the wing interiors have none (interior spaces without a hardwired sensor are the normal case). A2 and B2 carry no fuel.

## The two hypotheses

H1 = {A1} is burning. H2 = {B1} is burning. Truth in every run below is H1.

## The measurement vector

| sensor | space | H1 = {A1} | H2 = {B1} | difference |
|---|---|---|---|---|
| FP | P | 288.3 C | 288.3 C | 0.0 |
| FQ | Q | 242.6 C | 242.6 C | 0.0 |
| FR | R | 214.0 C | 214.0 C | 0.0 |

Meanwhile A1 sits at 710.9 C under H1 and 163.0 C under H2. The fire is real; it is unseen.

**No estimator can distinguish H1 from H2 with this sensor set, because swapping the two wings is a symmetry of the plan that fixes every sensor, so the two fire states produce identical measurement vectors and any choice between them is a coin toss, whatever the algorithm.** The threshold for "identical" is 2 σ = 4 C of sensor noise; here the difference is exactly zero.

## The k = 1 sensor

On `ident-7` no single sensor carries the distinction: with the brain's own residual rule (drop one downward residual), the scores of H1 and H2 are equal with every sensor present and after removing any one of them. A k = 1 attacker needs to hit nothing. On the resolved plan below, exactly one sensor carries it, FA1, and its removal restores the tie (score(H1) = score(H2) = 0.4 with it gone; 0.2 versus 273.9 with it present).

## What the baselines do

Open loop, mode none, ticks 5 to 40: the naive Kalman names **neither wing** at confidence 0.84 to 0.87 the whole time (its unsensed wing estimates are symmetric, so it calls neither burning until the passage itself passes 200 C); the source Kalman names neither wing either. Coverage of the true fire: naive 18 %, source 15 %. Both report a wrong dispatch on 47 % and 57 % of ticks. With FP frozen from tick 5, both baselines lose the fire entirely (coverage 0 %).

## What ours does

The same ticks: `burningSet` empty or a best guess, with **{A1,A2} and {B1,B2} reported as ambiguous groups at confidence 0.14**, coverage 93 %, false certainty 0 % at every threshold. It does not know which wing burns, and it says so. (On two of the printed ticks the best-guess set names B1, the wrong wing: with identical scores the tie breaks by id. That is what an honest coin toss looks like from the outside, and the confidence stays at 0.14.)

## The operational cost

Closed loop (commands applied), two scouts and one tether starting at R. On `ident-7` the allocator hedges at tick 2: one scout to A1, one to B1, the tether to the passage. The scout that reaches B1 reads it cold at tick 5 and the belief resolves to A1 by elimination, but that scout then stays parked in the empty wing: **104 drone-ticks in the B wing versus 0 on the resolved plan.** The first scout into the A wing arrives only at tick 54 (A1 is lethal to a free-flyer, so it waits at the passage). Containment is the same on both plans (one space ever burns, out by tick 60): the tether finds the right space either way, so here the ambiguity costs sensing effort, not structure.

## The fix

`ident-7-fixed` adds one fixed sensor, FA1, in A1. The measurement vectors now differ by 547.9 C at that sensor and by nothing elsewhere; ours names A1 from tick 1 and the B wing is out of play for 22 of the first 40 ticks (it re-enters as a maybe once the passage nears ignition); the naive Kalman names A1 and the fuel-less void A2 together at confidence 0.90 (false certainty 13 %, wrong dispatch 97 %); the source Kalman names A1 alone. Freeze FA1 from tick 5 and the B wing is back in play on 34 of 40 ticks; blind it and 37 of 40, with the naive Kalman now committing to A2 alone at 0.90. One extra observation resolves the pair; one corruption of that observation takes the resolution away.

## Generalization

This is a symmetry argument, so it is not about this plan. Any structure with two spaces that are equivalent under a graph automorphism fixing the sensor set has such a pair, and no estimator, however good, can separate them from those sensors. Sensor placement must break every such symmetry: at least one sensor on an orbit the automorphism moves. That is a placement criterion, not an estimator fix, and it is checkable on the plan file before a single sensor is installed. The frozen estimator's contribution is to report the ambiguity as a set instead of picking a side.
