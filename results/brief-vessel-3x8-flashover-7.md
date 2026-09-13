# Commander's brief: vessel-3x8, flashover, seed 7, 120 ticks

Same allocator, one belief per brain, one world each (closed loop).

```
brain                 fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
ours                          28               1               1              29               1              14            0.60               1              42              12
kalman                        33               1               1              34               1              40            2.70               0              11               0
kalman-source                 33               1               1              34               1              62            3.45               0              14               0
```

```
COMMANDER'S BRIEF: ours

Situation
  Structure vessel-3x8: 24 spaces on 3 level(s), 22 fixed sensors, resupply at L1-A1.
  Fire started in L1-B3. Failure mode: flashover from tick 5, k=1. Seed 7. 120 ticks (1..120).
  Drones: D1 scout, D2 scout, D3 tether, D4 tether, D5 retardant, D6 hatch.

Play by play
  t=  1  L1-B3 is burning at the start
  t=  1  D3 (tether) L1-A1 -> L1-B3 suppress
  t=  1  D4 (tether) L1-A1 -> L1-B3 suppress
  t=  1  D5 (retardant) L1-A1 -> L1-A3 coat
  t=  1  D6 (hatch) L1-A1 -> L2-B3 close-door
  t=  1  contained: no new space ignites after this (1 ever burned)
  t=  2  D1 (scout) L1-A1 -> L2-B2 observe
  t=  2  D5 (retardant) L1-A2 -> L1-A2 coat
  t=  2  D6 (hatch) L1-A2 -> L1-A3 close-door
  t=  3  D5 (retardant) L1-A2 -> L1-A3 coat
  t=  3  D6 (hatch) L1-A3 -> L2-B3 close-door
  t=  5  D1 (scout) L1-A2 -> L2-B2 observe
  t=  5  D2 (scout) L1-A1 -> L2-B2 observe
  t=  5  D3 (tether) L1-B3 -> L1-B4 suppress
  t=  5  D4 (tether) L1-B3 -> L1-B4 suppress
  t=  5  D5 (retardant) L1-A3 -> L1-B3 coat
  t=  5  D6 (hatch) L2-A3 -> L2-B3 close-door
  t=  6  D3 (tether) L1-B4 -> L1-B3 suppress
  t=  6  D4 (tether) L1-B4 -> L1-B3 suppress
  t=  6  hedge across {L1-A3,L1-B3,L2-B3}: D3->L1-B3, D4->L1-B3, D6->L2-B3
  t=  6  D5 (retardant) dies in L1-B3 (439 C)
  t=  7  D3 (tether) L1-B3 -> L1-A3 suppress
  t=  7  hedge across {L1-B3,L1-B4,L2-B3}: D4->L1-B3, D6->L2-B3
  t=  8  D3 (tether) L1-A3 -> L1-B3 suppress
  t=  9  D1 (scout) L2-B2 -> L2-B2 observe
  t=  9  D3 (tether) L1-B3 -> L1-A3 suppress
  t=  9  D4 (tether) L1-B3 -> L1-B4 suppress
  t=  9  D6 (hatch) L2-B3 -> L2-B3 close-door
  t= 10  D3 (tether) L1-A3 -> L1-B3 suppress
  t= 10  D4 (tether) L1-B4 -> L1-B3 suppress
  t= 10  hedge across {L1-B3,L2-B3}: D3->L1-B3, D4->L1-B3, D6->L2-B3
  t= 11  D3 (tether) L1-B3 -> L1-A3 suppress
  t= 11  hedge across {L1-B3,L1-B4,L2-B3}: D4->L1-B3, D6->L2-B3
  t= 12  D3 (tether) L1-A3 -> L1-B3 suppress
  t= 13  D1 (scout) L2-B2 -> L2-B2 observe
  t= 13  D3 (tether) L1-B3 -> L1-A3 suppress
  t= 13  D4 (tether) L1-B3 -> L1-B4 suppress
  t= 13  D6 (hatch) L2-B3 -> L2-B3 close-door
  t= 14  D3 (tether) L1-A3 -> L1-B3 suppress
  t= 14  D4 (tether) L1-B4 -> L1-B3 suppress
  ... 54 more events not shown

Outcome
  fireVolume 28 space-ticks, peak 1 burning at once, burned out: L1-B3.
  contained tick 1, extinguished tick 29.
  drones used: hatch 1 (D6); retardant 1 (D5); scout 2 (D1, D2); tether 2 (D3, D4).
  water: 14 tether-ticks on suppress; retardant spent 0.60.
  drone deaths: retardant 1 (D5).
  commands to the wrong place: 42; hedges: 12.

The fire was put out at tick 29 after burning 28 space-ticks; 1 space(s) burned out.
```

```
COMMANDER'S BRIEF: kalman

Situation
  Structure vessel-3x8: 24 spaces on 3 level(s), 22 fixed sensors, resupply at L1-A1.
  Fire started in L1-B3. Failure mode: flashover from tick 5, k=1. Seed 7. 120 ticks (1..120).
  Drones: D1 scout, D2 scout, D3 tether, D4 tether, D5 retardant, D6 hatch.

Play by play
  t=  1  L1-B3 is burning at the start
  t=  1  D3 (tether) L1-A1 -> L1-B3 suppress
  t=  1  D4 (tether) L1-A1 -> L1-B3 suppress
  t=  1  D5 (retardant) L1-A1 -> L1-A3 coat
  t=  1  contained: no new space ignites after this (1 ever burned)
  t=  6  D3 (tether) L1-B3 -> L1-B3 suppress
  t=  6  D4 (tether) L1-B3 -> L1-B3 suppress
  t=  6  D5 (retardant) L1-A3 -> L1-A3 coat
  t=  9  D3 (tether) L1-B3 -> L1-B3 suppress
  t=  9  D4 (tether) L1-B3 -> L1-B3 suppress
  t=  9  D5 (retardant) L1-A3 -> L1-A3 coat
  t= 10  D5 (retardant) L1-A3 -> L1-A1 refill
  t= 12  D3 (tether) L1-B3 -> L1-B3 suppress
  t= 12  D4 (tether) L1-B3 -> L1-B3 suppress
  t= 12  D5 (retardant) L1-A1 -> L1-A3 coat
  t= 15  D3 (tether) L1-B3 -> L1-B3 suppress
  t= 15  D4 (tether) L1-B3 -> L1-B3 suppress
  t= 15  D5 (retardant) L1-A3 -> L1-A3 coat
  t= 18  D3 (tether) L1-B3 -> L1-B3 suppress
  t= 18  D4 (tether) L1-B3 -> L1-B3 suppress
  t= 18  D5 (retardant) L1-A3 -> L1-A3 coat
  t= 21  D3 (tether) L1-B3 -> L1-B3 suppress
  t= 21  D4 (tether) L1-B3 -> L1-B3 suppress
  t= 21  D5 (retardant) L1-A3 -> L1-A3 coat
  t= 22  D5 (retardant) L1-A3 -> L1-A1 refill
  t= 24  D3 (tether) L1-B3 -> L1-B3 suppress
  t= 24  D4 (tether) L1-B3 -> L1-B3 suppress
  t= 24  D5 (retardant) L1-A1 -> L1-A3 coat
  t= 27  D3 (tether) L1-B3 -> L1-B3 suppress
  t= 27  D4 (tether) L1-B3 -> L1-B3 suppress
  t= 27  D5 (retardant) L1-A3 -> L1-A3 coat
  t= 28  D5 (retardant) L1-A3 -> L1-A2 coat
  t= 29  D3 (tether) L1-B3 -> L1-A3 suppress
  t= 29  D4 (tether) L1-B3 -> L1-A3 suppress
  t= 29  D5 (retardant) L1-A2 -> L1-B3 coat
  t= 30  D3 (tether) L1-A3 -> L1-B3 suppress
  t= 30  D4 (tether) L1-A3 -> L1-B3 suppress
  t= 30  D5 (retardant) L1-A3 -> L1-A3 coat
  t= 33  D3 (tether) L1-B3 -> L1-B3 suppress
  t= 33  D4 (tether) L1-B3 -> L1-B3 suppress
  ... 6 more events not shown

Outcome
  fireVolume 33 space-ticks, peak 1 burning at once, burned out: L1-B3.
  contained tick 1, extinguished tick 34.
  drones used: retardant 1 (D5); tether 2 (D3, D4).
  water: 40 tether-ticks on suppress; retardant spent 2.70.
  drone deaths: none.
  commands to the wrong place: 11; hedges: 0.

The fire was put out at tick 34 after burning 33 space-ticks; 1 space(s) burned out.
```

```
COMMANDER'S BRIEF: kalman-source

Situation
  Structure vessel-3x8: 24 spaces on 3 level(s), 22 fixed sensors, resupply at L1-A1.
  Fire started in L1-B3. Failure mode: flashover from tick 5, k=1. Seed 7. 120 ticks (1..120).
  Drones: D1 scout, D2 scout, D3 tether, D4 tether, D5 retardant, D6 hatch.

Play by play
  t=  1  L1-B3 is burning at the start
  t=  1  D3 (tether) L1-A1 -> L1-B3 suppress
  t=  1  D4 (tether) L1-A1 -> L1-B3 suppress
  t=  1  D5 (retardant) L1-A1 -> L1-A2 coat
  t=  1  contained: no new space ignites after this (1 ever burned)
  t=  2  D5 (retardant) L1-A2 -> L1-A3 coat
  t=  7  D5 (retardant) L1-A3 -> L1-A1 refill
  t=  9  D5 (retardant) L1-A1 -> L1-A3 coat
  t= 11  D5 (retardant) L1-A3 -> L2-A4 coat
  t= 15  D5 (retardant) L2-A4 -> L1-A3 coat
  t= 18  D5 (retardant) L1-A3 -> L1-A1 refill
  t= 20  D5 (retardant) L1-A1 -> L1-A3 coat
  t= 27  D5 (retardant) L1-A3 -> L1-A1 refill
  t= 29  D5 (retardant) L1-A1 -> L1-A3 coat
  t= 34  L1-B3 burns out
  t= 34  no space burning

Outcome
  fireVolume 33 space-ticks, peak 1 burning at once, burned out: L1-B3.
  contained tick 1, extinguished tick 34.
  drones used: retardant 1 (D5); tether 2 (D3, D4).
  water: 62 tether-ticks on suppress; retardant spent 3.45.
  drone deaths: none.
  commands to the wrong place: 14; hedges: 0.

The fire was put out at tick 34 after burning 33 space-ticks; 1 space(s) burned out.
```
