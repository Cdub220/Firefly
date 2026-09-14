# Commander's brief: vessel-3x8, blind, seed 42, 90 ticks

Same allocator, one belief per brain, one world each (closed loop).

```
brain                 fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
ours                          33               1               1              34               1              68            3.45               0              74               1
kalman                      1133              22              36              86              23             163            0.90               4              43               0
kalman-source               1183              23              35              85              24             173               0               4              29               0
```

```
COMMANDER'S BRIEF: ours

Situation
  Structure vessel-3x8: 24 spaces on 3 level(s), 22 fixed sensors, resupply at L1-A1.
  Fire started in L1-B3. Failure mode: blind from tick 1, k=1. Seed 42. 90 ticks (1..90).
  Drones: D1 scout, D2 scout, D3 tether, D4 tether, D5 retardant, D6 hatch.

Play by play
  t=  1  L1-B3 is burning at the start
  t=  1  sensor F-L1-B3 reads 24 C in L1-B3 (truth 455)
  t=  1  D1 (scout) L1-A1 -> L2-B3 observe
  t=  1  D3 (tether) L1-A1 -> L1-A3 suppress
  t=  1  D4 (tether) L1-A1 -> L1-A3 suppress
  t=  1  D5 (retardant) L1-A1 -> L2-A4 coat
  t=  1  D6 (hatch) L1-A1 -> L2-A3 close-door
  t=  1  contained: no new space ignites after this (1 ever burned)
  t=  2  D4 (tether) L1-A2 -> L1-B3 suppress
  t=  3  D3 (tether) L1-A3 -> L1-A4 suppress
  t=  3  D4 (tether) L1-A3 -> L1-A4 suppress
  t=  3  D5 (retardant) L1-A3 -> L1-B3 coat
  t=  3  D6 (hatch) L1-A3 -> L1-A3 close-door
  t=  4  D3 (tether) L1-A4 -> L1-B3 suppress
  t=  4  D4 (tether) L1-A4 -> L1-B3 suppress
  t=  4  D5 (retardant) L1-A3 -> L1-A3 coat
  t=  5  D6 (hatch) L1-A3 -> L2-B3 close-door
  t=  6  D1 (scout) L1-A3 -> L2-B2 observe
  t=  6  D5 (retardant) L1-A3 -> L2-A4 coat
  t=  7  brain marks F-L1-B3 suspect
  t=  7  D5 (retardant) L1-A4 -> L1-A4 coat
  t=  8  D2 (scout) L1-A1 -> L2-B2 observe
  t=  9  D6 (hatch) L2-B3 -> L1-A3 close-door
  t= 10  D1 (scout) L2-B2 -> L2-B2 observe
  t= 10  D2 (scout) L1-A2 -> L2-B3 observe
  t= 10  D5 (retardant) L1-A4 -> L1-A3 coat
  t= 10  D6 (hatch) L1-B3 -> L1-B3 close-door
  t= 11  D1 (scout) L2-B2 -> L2-B3 observe
  t= 11  D5 (retardant) L1-A3 -> L1-A1 refill
  t= 13  D5 (retardant) L1-A1 -> L1-A3 coat
  t= 15  D2 (scout) L1-B3 -> L2-B2 observe
  t= 20  D5 (retardant) L1-A3 -> L1-A1 refill
  t= 22  D5 (retardant) L1-A1 -> L1-A4 coat
  t= 23  D5 (retardant) L1-A2 -> L1-A3 coat
  t= 25  D2 (scout) L1-B2 -> L2-B2 observe
  t= 25  D5 (retardant) L1-A3 -> L2-B4 coat
  t= 26  D5 (retardant) L1-A4 -> L1-A4 coat
  t= 30  D5 (retardant) L1-A4 -> L1-A1 refill
  t= 33  D2 (scout) L2-B2 -> L2-B2 observe
  t= 33  D5 (retardant) L1-A1 -> L1-A4 coat
  ... 13 more events not shown

Outcome
  fireVolume 33 space-ticks, peak 1 burning at once, burned out: L1-B3.
  contained tick 1, extinguished tick 34.
  drones used: hatch 1 (D6); retardant 1 (D5); scout 2 (D1, D2); tether 2 (D3, D4).
  water: 68 tether-ticks on suppress; retardant spent 3.45.
  drone deaths: none.
  commands to the wrong place: 74; hedges: 1.

The fire was put out at tick 34 after burning 33 space-ticks; 1 space(s) burned out.
```

```
COMMANDER'S BRIEF: kalman

Situation
  Structure vessel-3x8: 24 spaces on 3 level(s), 22 fixed sensors, resupply at L1-A1.
  Fire started in L1-B3. Failure mode: blind from tick 1, k=1. Seed 42. 90 ticks (1..90).
  Drones: D1 scout, D2 scout, D3 tether, D4 tether, D5 retardant, D6 hatch.

Play by play
  t=  1  L1-B3 is burning at the start
  t=  1  sensor F-L1-B3 reads 24 C in L1-B3 (truth 455)
  t=  6  D3 (tether) L1-A1 -> L1-A3 suppress
  t=  6  D4 (tether) L1-A1 -> L1-B4 suppress
  t=  6  D5 (retardant) L1-A1 -> L1-B3 coat
  t= 10  L1-B4 ignites
  t= 12  D3 (tether) L1-A3 -> L1-A4 suppress
  t= 12  D5 (retardant) L1-A3 -> L2-A4 coat
  t= 14  L1-A3 ignites
  t= 18  L1-B2 ignites
  t= 19  L1-A4 ignites
  t= 19  D5 (retardant) L2-A4 -> L1-A1 refill
  t= 22  L1-A2 ignites
  t= 23  D5 (retardant) L1-A1 -> L2-A4 coat
  t= 24  D5 (retardant) L2-A1 -> L1-B3 coat
  t= 25  L1-B1 ignites
  t= 27  L1-A1 ignites
  t= 27  L2-B3 ignites
  t= 28  L2-A3 ignites
  t= 28  D1 (scout) dies in L1-A1 (473 C)
  t= 28  D2 (scout) dies in L1-A1 (473 C)
  t= 28  D5 (retardant) dies in L2-B3 (423 C)
  t= 28  D6 (hatch) dies in L1-A1 (473 C)
  t= 30  L2-A1 ignites
  t= 30  L2-A2 ignites
  t= 30  L2-B2 ignites
  t= 30  L2-B4 ignites
  t= 31  L2-B1 ignites
  t= 33  L3-A1 ignites
  t= 34  L1-B3 burns out
  t= 35  L3-A2 ignites
  t= 35  L3-A3 ignites
  t= 35  L3-B1 ignites
  t= 35  L3-B4 ignites
  t= 36  L3-A4 ignites
  t= 36  L3-B2 ignites
  t= 36  L3-B3 ignites
  t= 36  contained: no new space ignites after this (23 ever burned)
  t= 60  L1-B4 burns out
  t= 64  L1-A3 burns out
  ... 21 more events not shown

Outcome
  fireVolume 1133 space-ticks, peak 22 burning at once, burned out: L1-A1, L1-A2, L1-A3, L1-A4, L1-B1, L1-B2, L1-B3, L1-B4, L2-A1, L2-A2, L2-A3, L2-B1, L2-B2, L2-B3, L2-B4, L3-A1, L3-A2, L3-A3, L3-A4, L3-B1, L3-B2, L3-B3, L3-B4.
  contained tick 36, extinguished tick 86.
  drones used: retardant 1 (D5); tether 2 (D3, D4).
  water: 163 tether-ticks on suppress; retardant spent 0.90.
  drone deaths: hatch 1 (D6); retardant 1 (D5); scout 2 (D1, D2).
  commands to the wrong place: 43; hedges: 0.

The fire was put out at tick 86 after burning 1133 space-ticks; 23 space(s) burned out.
```

```
COMMANDER'S BRIEF: kalman-source

Situation
  Structure vessel-3x8: 24 spaces on 3 level(s), 22 fixed sensors, resupply at L1-A1.
  Fire started in L1-B3. Failure mode: blind from tick 1, k=1. Seed 42. 90 ticks (1..90).
  Drones: D1 scout, D2 scout, D3 tether, D4 tether, D5 retardant, D6 hatch.

Play by play
  t=  1  L1-B3 is burning at the start
  t=  1  sensor F-L1-B3 reads 24 C in L1-B3 (truth 455)
  t=  1  D3 (tether) L1-A1 -> L1-A3 suppress
  t=  1  D4 (tether) L1-A1 -> L1-B2 suppress
  t=  1  D5 (retardant) L1-A1 -> L1-B3 coat
  t= 10  L1-B4 ignites
  t= 14  L1-A4 ignites
  t= 14  D4 (tether) L1-B2 -> L2-A3 suppress
  t= 14  D5 (retardant) L1-A3 -> L2-A4 coat
  t= 15  L1-A3 ignites
  t= 15  D4 (tether) L1-A2 -> L1-A4 suppress
  t= 15  D5 (retardant) dies in L1-A4 (464 C)
  t= 19  L1-B2 ignites
  t= 22  L1-A2 ignites
  t= 23  L2-B4 ignites
  t= 26  L1-B1 ignites
  t= 26  L2-A4 ignites
  t= 26  L2-B3 ignites
  t= 28  L1-A1 ignites
  t= 28  L2-A3 ignites
  t= 28  L3-A4 ignites
  t= 29  L2-A2 ignites
  t= 29  L2-B2 ignites
  t= 29  D1 (scout) dies in L1-A1 (475 C)
  t= 29  D2 (scout) dies in L1-A1 (475 C)
  t= 29  D6 (hatch) dies in L1-A1 (475 C)
  t= 30  L3-B4 ignites
  t= 31  L2-A1 ignites
  t= 32  L2-B1 ignites
  t= 32  L3-A3 ignites
  t= 32  L3-B3 ignites
  t= 34  L3-A1 ignites
  t= 34  L3-A2 ignites
  t= 34  L3-B2 ignites
  t= 34  L1-B3 burns out
  t= 35  L3-B1 ignites
  t= 35  contained: no new space ignites after this (24 ever burned)
  t= 60  L1-B4 burns out
  t= 64  L1-A4 burns out
  t= 65  L1-A3 burns out
  ... 21 more events not shown

Outcome
  fireVolume 1183 space-ticks, peak 23 burning at once, burned out: L1-A1, L1-A2, L1-A3, L1-A4, L1-B1, L1-B2, L1-B3, L1-B4, L2-A1, L2-A2, L2-A3, L2-A4, L2-B1, L2-B2, L2-B3, L2-B4, L3-A1, L3-A2, L3-A3, L3-A4, L3-B1, L3-B2, L3-B3, L3-B4.
  contained tick 35, extinguished tick 85.
  drones used: retardant 1 (D5); tether 2 (D3, D4).
  water: 173 tether-ticks on suppress; retardant spent 0.00.
  drone deaths: hatch 1 (D6); retardant 1 (D5); scout 2 (D1, D2).
  commands to the wrong place: 29; hedges: 0.

The fire was put out at tick 85 after burning 1183 space-ticks; 24 space(s) burned out.
```
