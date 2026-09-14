# Showdown: vessel-3x8, ignition sensor blind from tick 1, seed 42, 90 ticks

Same ship, same fire, same six drones, same allocator. Each brain drives its own copy of the world. Produced by `npm run brief` with onset 1 (the head-to-head view's Showdown button).

```
brain                 fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
ours                          33               1               1              34               1              68            3.45               0              74               1
kalman                      1133              22              35              85              23             147            0.90               4              23               0
kalman-source               1183              23              35              85              24              54               0               4              22               0
```

## ours: commander's brief

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

## ours: decision transcript (74 lines)

```
t= 1  Believes L1-A3 burning (L1-A3 48%; confidence 0.10).
t= 1  Cannot tell whether L1-A2, L1-A4, L1-B3 and 1 more are burning or just hot (L1-A2 19%, L1-A4 19%, L1-B3 19%, L2-A3 19%).
t= 1  No trusted reading from L2-B3: sending 1 scout (D1) to L2-B3 to look.
t= 1  L1-A3 on fire (48%): sending 2 water tethers (D3, D4) to L1-A3 to cool it.
t= 1  L2-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L2-A4 to coat it.
t= 1  Close doors at L2-A3 to slow the spread: sending 1 hatch drone (D6) to L2-A3 to seal it.
t= 2  Cannot tell whether L1-A4, L1-B3, L2-A3 are burning or just hot (L1-A4 22%, L1-B3 26%, L2-A3 22%).
t= 2  L1-B3 may be burning (26%): sending 1 water tether (D4) to L1-B3 to cool it.
t= 3  Believes L1-A3, L1-A4 burning (L1-A3 88%, L1-A4 28%; confidence 0.10).
t= 3  Cannot tell whether L1-A2, L1-B3, L2-A3 are burning or just hot (L1-A2 20%, L1-B3 29%, L2-A3 12%).
t= 3  L1-A4 on fire (28%): sending 2 water tethers (D3, D4) to L1-A4 to cool it.
t= 3  L1-B3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-B3 to coat it.
t= 3  Close doors at L1-A3 to slow the spread: sending 1 hatch drone (D6) to L1-A3 to seal it.
t= 4  Believes L1-B3 burning (L1-B3 90%; confidence 0.58).
t= 4  L1-B3 on fire (90%): sending 2 water tethers (D3, D4) to L1-B3 to cool it.
t= 4  L1-A3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A3 to coat it.
t= 5  Cannot tell whether L2-B3 is burning or just hot (L2-B3 39%).
t= 5  Close doors at L2-B3 to slow the spread: sending 1 hatch drone (D6) to L2-B3 to seal it.
t= 6  Believes L1-B3, L1-B4 burning (L1-B3 48%, L1-B4 38%; confidence 0.05).
t= 6  Cannot tell whether L1-A4, L1-B2, L2-B3 are burning or just hot (L1-A4 25%, L1-B2 22%, L2-B3 17%).
t= 6  No trusted reading from L2-B2: sending 1 scout (D1) to L2-B2 to look.
t= 6  L2-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L2-A4 to coat it.
t= 7  Believes L1-A3, L1-B3 burning (L1-A3 36%, L1-B3 59%; confidence 0.05).
t= 7  Cannot tell whether L1-B2, L1-B4, L2-B3 are burning or just hot (L1-B2 27%, L1-B4 48%, L2-B3 14%).
t= 7  Distrusts sensor F-L1-B3: the reading contradicts the physics of the building.
t= 7  L1-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A4 to coat it.
t= 8  Cannot tell whether L1-B4, L2-B3 are burning or just hot (L1-B4 33%, L2-B3 24%).
t= 8  No trusted reading from L2-B2: sending 1 scout (D2) to L2-B2 to look.
t= 9  Believes L1-B3 burning (L1-B3 44%; confidence 0.13).
t= 9  Cannot tell whether L1-A3, L1-B4, L2-B4 are burning or just hot (L1-A3 26%, L1-B4 33%, L2-B4 15%).
t= 9  Close doors at L1-A3 to slow the spread: sending 1 hatch drone (D6) to L1-A3 to seal it.
t=10  Cannot tell whether L1-B4, L2-B3 are burning or just hot (L1-B4 19%, L2-B3 16%).
t=10  No trusted reading from L2-B2: sending 1 scout (D1) to L2-B2 to look.
t=10  Unsure whether L2-B3 is burning or just hot (16%), need a reading there: sending 1 scout (D2) to L2-B3 to look.
t=10  L1-A3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A3 to coat it.
t=10  Close doors at L1-B3 to slow the spread: sending 1 hatch drone (D6) to L1-B3 to seal it.
t=11  Cannot tell whether L1-B4 is burning or just hot (L1-B4 27%).
t=11  No trusted reading from L2-B3: sending 1 scout (D1) to L2-B3 to look.
t=11  1 retardant drone (D5) out of retardant, back to resupply at L1-A1.
t=13  L1-A3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A3 to coat it.
t=15  Cannot tell whether L1-B2, L1-B4 are burning or just hot (L1-B2 19%, L1-B4 22%).
t=15  No trusted reading from L2-B2: sending 1 scout (D2) to L2-B2 to look.
t=16  Cannot tell whether L1-B4 is burning or just hot (L1-B4 27%).
t=20  1 retardant drone (D5) out of retardant, back to resupply at L1-A1.
t=22  Cannot tell whether L1-A3, L1-B4 are burning or just hot (L1-A3 16%, L1-B4 23%).
t=22  L1-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A4 to coat it.
t=23  Cannot tell whether L1-B4 is burning or just hot (L1-B4 28%).
t=23  L1-A3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A3 to coat it.
t=25  Cannot tell whether L1-B4, L2-B3 are burning or just hot (L1-B4 24%, L2-B3 14%).
t=25  No trusted reading from L2-B2: sending 1 scout (D2) to L2-B2 to look.
t=25  L2-B4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L2-B4 to coat it.
t=26  Cannot tell whether L1-B2, L1-B4 are burning or just hot (L1-B2 19%, L1-B4 17%).
t=26  L1-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A4 to coat it.
t=30  Cannot tell whether L1-A3, L1-B2, L1-B4 are burning or just hot (L1-A3 13%, L1-B2 17%, L1-B4 16%).
t=30  1 retardant drone (D5) out of retardant, back to resupply at L1-A1.
t=31  Cannot tell whether L1-B2, L1-B4 are burning or just hot (L1-B2 18%, L1-B4 23%).
t=32  Cannot tell whether L1-A3, L1-B4 are burning or just hot (L1-A3 15%, L1-B4 25%).
t=33  Cannot tell whether L1-A3, L1-B2, L1-B4 are burning or just hot (L1-A3 13%, L1-B2 13%, L1-B4 29%).
t=33  No trusted reading from L2-B2: sending 1 scout (D2) to L2-B2 to look.
t=33  L1-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A4 to coat it.
t=34  L1-A2 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A2 to coat it.
t=35  Cannot tell whether L1-B4, L2-B3 are burning or just hot (L1-B4 18%, L2-B3 15%).
t=35  L2-B4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L2-B4 to coat it.
t=36  No space believed burning any more (confidence 0.16).
t=36  Cannot tell whether L1-A4, L1-B3, L1-B4 and 1 more are burning or just hot (L1-A4 13%, L1-B3 22%, L1-B4 13%, L2-B4 14%).
t=36  L2-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L2-A4 to coat it.
t=36  Close doors at L1-B4 to slow the spread: sending 1 hatch drone (D6) to L1-B4 to seal it.
t=37  Cannot tell whether L1-B3 is burning or just hot (L1-B3 34%).
t=37  L1-A3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A3 to coat it.
t=37  Close doors at L1-B3 to slow the spread: sending 1 hatch drone (D6) to L1-B3 to seal it.
t=40  Cannot tell whether L2-A4 is burning or just hot (L2-A4 28%).
t=40  L2-A4 may be burning (28%): sending 2 water tethers (D3, D4) to L2-A4 to cool it.
t=40  L1-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-A4 to coat it.
t=40  Close doors at L2-A4 to slow the spread: sending 1 hatch drone (D6) to L2-A4 to seal it.
```

## kalman: commander's brief

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
  t= 16  D4 (tether) L1-B4 -> L1-A2 suppress
  t= 18  L1-B2 ignites
  t= 19  L1-A4 ignites
  t= 19  D4 (tether) L1-A2 -> L1-A4 suppress
  t= 19  D5 (retardant) L2-A4 -> L1-A1 refill
  t= 20  D4 (tether) L1-A3 -> L1-A2 suppress
  t= 21  D4 (tether) L1-A2 -> L2-B4 suppress
  t= 22  D3 (tether) L1-A4 -> L2-A4 suppress
  t= 22  D4 (tether) L1-A3 -> L2-A4 suppress
  t= 23  L1-A2 ignites
  t= 23  D5 (retardant) L1-A1 -> L1-B3 coat
  t= 24  D3 (tether) L2-A4 -> L1-A4 suppress
  t= 24  D4 (tether) L2-A4 -> L2-B4 suppress
  t= 24  D5 (retardant) dies in L1-A2 (460 C)
  t= 25  L1-B1 ignites
  t= 25  L2-B3 ignites
  t= 25  D3 (tether) L1-A4 -> L2-A4 suppress
  t= 27  L2-A3 ignites
  t= 28  L1-A1 ignites
  t= 28  L2-B2 ignites
  t= 28  L2-B4 ignites
  t= 28  D4 (tether) L2-B4 -> L2-B2 suppress
  t= 29  L2-A2 ignites
  t= 29  D1 (scout) dies in L1-A1 (492 C)
  t= 29  D2 (scout) dies in L1-A1 (492 C)
  t= 29  D6 (hatch) dies in L1-A1 (492 C)
  t= 31  L2-A1 ignites
  t= 31  L2-B1 ignites
  t= 31  D4 (tether) L2-B2 -> L3-B3 suppress
  t= 34  L3-A1 ignites
  t= 34  L3-A3 ignites
  ... 31 more events not shown

Outcome
  fireVolume 1133 space-ticks, peak 22 burning at once, burned out: L1-A1, L1-A2, L1-A3, L1-A4, L1-B1, L1-B2, L1-B3, L1-B4, L2-A1, L2-A2, L2-A3, L2-B1, L2-B2, L2-B3, L2-B4, L3-A1, L3-A2, L3-A3, L3-A4, L3-B1, L3-B2, L3-B3, L3-B4.
  contained tick 35, extinguished tick 85.
  drones used: retardant 1 (D5); tether 2 (D3, D4).
  water: 147 tether-ticks on suppress; retardant spent 0.90.
  drone deaths: hatch 1 (D6); retardant 1 (D5); scout 2 (D1, D2).
  commands to the wrong place: 23; hedges: 0.

The fire was put out at tick 85 after burning 1133 space-ticks; 23 space(s) burned out.
```

## kalman: decision transcript (34 lines)

```
t= 1  No fire detected yet (confidence 0.96).
t= 6  Believes L1-A3, L1-B4 burning (L1-A3 100%, L1-B4 98%; confidence 0.96).
t= 6  L1-A3 on fire (100%): sending 1 water tether (D3) to L1-A3 to cool it.
t= 6  L1-B4 on fire (98%): sending 1 water tether (D4) to L1-B4 to cool it.
t= 6  L1-B3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-B3 to coat it.
t=10  Believes L1-A3, L1-B2, L1-B4 burning (L1-A3 100%, L1-B2 90%, L1-B4 100%; confidence 0.96).
t=12  Believes L1-A3, L1-A4, L1-B2 and 1 more burning (L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%; confidence 0.96).
t=12  L1-A4 on fire (100%): sending 1 water tether (D3) to L1-A4 to cool it.
t=12  L2-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L2-A4 to coat it.
t=16  Believes L1-A2, L1-A3, L1-A4 and 2 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%; confidence 0.96).
t=16  L1-A2 on fire (100%): sending 1 water tether (D4) to L1-A2 to cool it.
t=19  Believes L1-A3, L1-A4, L1-B2 and 1 more burning (L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%; confidence 0.96).
t=19  L1-A4 on fire (100%): sending 1 water tether (D4) to L1-A4 to cool it.
t=19  1 retardant drone (D5) out of retardant, back to resupply at L1-A1.
t=20  Believes L1-A2, L1-A3, L1-A4 and 2 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%; confidence 0.96).
t=20  L1-A2 on fire (100%): sending 1 water tether (D4) to L1-A2 to cool it.
t=21  Believes L1-A2, L1-A3, L1-A4 and 4 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 96%, L1-B2 100%, L1-B4 100%, L2-B4 100%; confidence 0.96).
t=21  L2-B4 on fire (100%): sending 1 water tether (D4) to L2-B4 to cool it.
t=22  Believes L1-A2, L1-A3, L1-A4 and 6 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A3 100%, L2-A4 69%, L2-B4 100%; confidence 0.96).
t=22  L2-A4 on fire (69%): sending 2 water tethers (D3, D4) to L2-A4 to cool it.
t=23  L1-B3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-B3 to coat it.
t=24  Believes L1-A2, L1-A3, L1-A4 and 5 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A3 100%, L2-B4 100%; confidence 0.96).
t=24  L1-A4 on fire (100%): sending 1 water tether (D3) to L1-A4 to cool it.
t=24  L2-B4 on fire (100%): sending 1 water tether (D4) to L2-B4 to cool it.
t=25  Believes L1-A1, L1-A2, L1-A3 and 7 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A3 100%, L2-A4 100%, L2-B4 100%; confidence 0.96).
t=25  L2-A4 on fire (100%): sending 1 water tether (D3) to L2-A4 to cool it.
t=26  Believes L1-A1, L1-A2, L1-A3 and 8 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B4 100%; confidence 0.96).
t=28  Believes L1-A1, L1-A2, L1-A3 and 11 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 87%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 81%, L2-B4 100%; confidence 0.96).
t=28  L2-B2 on fire (81%): sending 1 water tether (D4) to L2-B2 to cool it.
t=29  Believes L1-A1, L1-A2, L1-A3 and 12 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%; confidence 0.96).
t=31  Believes L1-A1, L1-A2, L1-A3 and 15 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A3 85%, L3-B3 100%; confidence 0.96).
t=31  L3-B3 on fire (100%): sending 1 water tether (D4) to L3-B3 to cool it.
t=32  Believes L1-A1, L1-A2, L1-A3 and 18 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A3 100%, L3-A4 100%, L3-B3 100%, L3-B4 100%; confidence 0.96).
t=33  Believes L1-A1, L1-A2, L1-A3 and 20 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A3 100%, L3-A4 100%, L3-B1 100%, L3-B2 100%, L3-B3 100%, L3-B4 100%; confidence 0.96).
```

## kalman-source: commander's brief

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
  t= 14  D3 (tether) L1-A3 -> L2-A3 suppress
  t= 14  D5 (retardant) L1-A3 -> L2-A4 coat
  t= 15  L1-A3 ignites
  t= 15  D3 (tether) L2-A3 -> L1-A4 suppress
  t= 15  D5 (retardant) dies in L1-A4 (464 C)
  t= 17  D4 (tether) L1-B2 -> L2-A3 suppress
  t= 18  D4 (tether) L1-A2 -> L2-B4 suppress
  t= 19  D3 (tether) L1-A4 -> L2-B4 suppress
  t= 19  D4 (tether) L1-A3 -> L2-A3 suppress
  t= 20  L1-B2 ignites
  t= 20  D4 (tether) L2-A3 -> L1-A4 suppress
  t= 21  L1-A2 ignites
  t= 21  D3 (tether) L2-B4 -> L2-A3 suppress
  t= 22  D4 (tether) L1-A4 -> L1-A2 suppress
  t= 23  D3 (tether) L2-A3 -> L1-A2 suppress
  t= 23  D4 (tether) L1-A3 -> L1-A4 suppress
  t= 24  L2-B4 ignites
  t= 24  D4 (tether) L1-A4 -> L2-B4 suppress
  t= 25  L2-A4 ignites
  t= 25  L2-B3 ignites
  t= 25  D3 (tether) L1-A2 -> L1-A4 suppress
  t= 26  L1-B1 ignites
  t= 26  L2-A3 ignites
  t= 26  D3 (tether) L1-A3 -> L3-A4 suppress
  t= 26  D4 (tether) L2-B4 -> L2-A4 suppress
  t= 27  L3-A4 ignites
  t= 28  L1-A1 ignites
  t= 28  L2-A2 ignites
  t= 28  L2-B2 ignites
  t= 28  D3 (tether) L2-A4 -> L2-A4 suppress
  t= 29  D3 (tether) L2-A4 -> L3-A4 suppress
  t= 29  D4 (tether) L2-A4 -> L1-A4 suppress
  t= 29  D1 (scout) dies in L1-A1 (484 C)
  ... 116 more events not shown

Outcome
  fireVolume 1183 space-ticks, peak 23 burning at once, burned out: L1-A1, L1-A2, L1-A3, L1-A4, L1-B1, L1-B2, L1-B3, L1-B4, L2-A1, L2-A2, L2-A3, L2-A4, L2-B1, L2-B2, L2-B3, L2-B4, L3-A1, L3-A2, L3-A3, L3-A4, L3-B1, L3-B2, L3-B3, L3-B4.
  contained tick 35, extinguished tick 85.
  drones used: retardant 1 (D5); tether 2 (D3, D4).
  water: 54 tether-ticks on suppress; retardant spent 0.00.
  drone deaths: hatch 1 (D6); retardant 1 (D5); scout 2 (D1, D2).
  commands to the wrong place: 22; hedges: 0.

The fire was put out at tick 85 after burning 1183 space-ticks; 24 space(s) burned out.
```

## kalman-source: decision transcript (147 lines)

```
t= 1  Believes L1-A3, L1-B2, L1-B4 burning (L1-A3 100%, L1-B2 100%, L1-B4 100%; confidence 0.94).
t= 1  L1-A3 on fire (100%): sending 1 water tether (D3) to L1-A3 to cool it.
t= 1  L1-B2 on fire (100%): sending 1 water tether (D4) to L1-B2 to cool it.
t= 1  L1-B3 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L1-B3 to coat it.
t=14  Believes L1-A3, L1-B2, L1-B4 and 1 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A3 84%; confidence 0.94).
t=14  L2-A3 on fire (84%): sending 1 water tether (D3) to L2-A3 to cool it.
t=14  L2-A4 is next to the fire and unburned: strip its fuel before it catches: sending 1 retardant drone (D5) to L2-A4 to coat it.
t=15  Believes L1-A3, L1-A4, L1-B2 and 1 more burning (L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%; confidence 0.94).
t=15  L1-A4 on fire (100%): sending 1 water tether (D3) to L1-A4 to cool it.
t=17  Believes L1-A3, L1-A4, L1-B2 and 2 more burning (L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%, L2-A3 83%; confidence 0.94).
t=17  L2-A3 on fire (83%): sending 1 water tether (D4) to L2-A3 to cool it.
t=18  Believes L1-A3, L1-A4, L1-B2 and 3 more burning (L1-A3 100%, L1-A4 66%, L1-B2 100%, L1-B4 100%, L2-A3 89%, L2-B4 76%; confidence 0.94).
t=18  L2-B4 on fire (76%): sending 1 water tether (D4) to L2-B4 to cool it.
t=19  Believes L1-A3, L1-B2, L1-B4 and 2 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A3 93%, L2-B4 80%; confidence 0.94).
t=19  L2-B4 on fire (80%): sending 1 water tether (D3) to L2-B4 to cool it.
t=19  L2-A3 on fire (93%): sending 1 water tether (D4) to L2-A3 to cool it.
t=20  Believes L1-A3, L1-A4, L1-B2 and 2 more burning (L1-A3 100%, L1-A4 96%, L1-B2 100%, L1-B4 100%, L2-B4 84%; confidence 0.94).
t=20  L1-A4 on fire (96%): sending 1 water tether (D4) to L1-A4 to cool it.
t=21  Believes L1-A3, L1-A4, L1-B2 and 2 more burning (L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%, L2-A3 86%; confidence 0.94).
t=21  L2-A3 on fire (86%): sending 1 water tether (D3) to L2-A3 to cool it.
t=22  Believes L1-A2, L1-A3, L1-B2 and 2 more burning (L1-A2 100%, L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A3 92%; confidence 0.93).
t=22  L1-A2 on fire (100%): sending 1 water tether (D4) to L1-A2 to cool it.
t=23  Believes L1-A2, L1-A3, L1-A4 and 2 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%; confidence 0.93).
t=23  L1-A2 on fire (100%): sending 1 water tether (D3) to L1-A2 to cool it.
t=23  L1-A4 on fire (100%): sending 1 water tether (D4) to L1-A4 to cool it.
t=24  Believes L1-A2, L1-A3, L1-B2 and 2 more burning (L1-A2 100%, L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-B4 79%; confidence 0.93).
t=24  L2-B4 on fire (79%): sending 1 water tether (D4) to L2-B4 to cool it.
t=25  Believes L1-A2, L1-A3, L1-A4 and 4 more burning (L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B2 100%, L1-B4 100%, L2-A3 86%, L2-B4 100%; confidence 0.93).
t=25  L1-A4 on fire (99%): sending 1 water tether (D3) to L1-A4 to cool it.
t=26  Believes L1-A2, L1-A3, L1-A4 and 6 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B2 100%, L1-B4 100%, L2-A3 100%, L2-A4 100%, L2-B4 100%, L3-A4 100%; confidence 0.93).
t=26  L3-A4 on fire (100%): sending 1 water tether (D3) to L3-A4 to cool it.
t=26  L2-A4 on fire (100%): sending 1 water tether (D4) to L2-A4 to cool it.
t=27  Believes L1-A2, L1-A3, L1-A4 and 7 more burning (L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A3 100%, L2-A4 100%, L2-B4 100%, L3-A4 100%; confidence 0.93).
t=28  L2-A4 on fire (62%): sending 1 water tether (D3) to L2-A4 to cool it.
t=29  Believes L1-A1, L1-A2, L1-A3 and 8 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A2 100%, L2-A3 100%, L2-B4 100%, L3-A4 100%; confidence 0.93).
t=29  L3-A4 on fire (100%): sending 1 water tether (D3) to L3-A4 to cool it.
t=29  L1-A4 on fire (100%): sending 1 water tether (D4) to L1-A4 to cool it.
t=30  Believes L1-A1, L1-A2, L1-A3 and 11 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A2 100%, L2-A3 100%, L2-A4 65%, L2-B2 100%, L2-B4 100%, L3-A4 100%, L3-B3 67%; confidence 0.93).
t=30  L2-A4 on fire (65%): sending 1 water tether (D3) to L2-A4 to cool it.
t=30  L3-B3 on fire (67%): sending 1 water tether (D4) to L3-B3 to cool it.
t=31  Believes L1-A1, L1-A2, L1-A3 and 11 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A2 100%, L2-A3 100%, L2-B2 100%, L2-B4 100%, L3-A4 100%, L3-B3 73%, L3-B4 100%; confidence 0.93).
t=31  L3-B3 on fire (73%): sending 1 water tether (D3) to L3-B3 to cool it.
t=31  L3-B4 on fire (100%): sending 1 water tether (D4) to L3-B4 to cool it.
t=32  Believes L1-A1, L1-A2, L1-A3 and 15 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B4 100%, L3-A3 100%, L3-A4 100%, L3-B3 73%, L3-B4 100%; confidence 0.93).
t=32  L2-A4 on fire (100%): sending 1 water tether (D4) to L2-A4 to cool it.
t=33  Believes L1-A1, L1-A2, L1-A3 and 15 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A3 100%, L3-A4 100%, L3-B3 100%, L3-B4 100%; confidence 0.95).
t=33  L3-A3 on fire (100%): sending 1 water tether (D4) to L3-A3 to cool it.
t=34  Believes L1-A1, L1-A2, L1-A3 and 18 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 95%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A3 100%, L3-A4 100%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=35  Believes L1-A1, L1-A2, L1-A3 and 18 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A3 100%, L3-A4 100%, L3-B2 100%, L3-B4 100%; confidence 0.94).
t=35  L3-B2 on fire (100%): sending 1 water tether (D3) to L3-B2 to cool it.
t=36  Believes L1-A1, L1-A2, L1-A3 and 20 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A3 93%, L3-A4 100%, L3-B1 100%, L3-B2 97%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=37  Believes L1-A1, L1-A2, L1-A3 and 18 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A4 100%, L3-B1 100%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=37  L3-A2 on fire (100%): sending 1 water tether (D3) to L3-A2 to cool it.
t=37  L2-A4 on fire (100%): sending 1 water tether (D4) to L2-A4 to cool it.
t=38  Believes L1-A1, L1-A2, L1-A3 and 20 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A3 97%, L3-A4 100%, L3-B1 100%, L3-B2 100%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=39  Believes L1-A1, L1-A2, L1-A3 and 18 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A3 100%, L3-A4 100%, L3-B1 100%, L3-B2 100%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=39  L3-B2 on fire (100%): sending 1 water tether (D3) to L3-B2 to cool it.
t=39  L3-A3 on fire (100%): sending 1 water tether (D4) to L3-A3 to cool it.
t=40  Believes L1-A1, L1-A2, L1-A3 and 18 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 100%, L3-A3 100%, L3-A4 100%, L3-B1 100%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=40  L3-A2 on fire (100%): sending 1 water tether (D3) to L3-A2 to cool it.
t=41  Believes L1-A1, L1-A2, L1-A3 and 18 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 93%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A4 100%, L3-B1 100%, L3-B2 96%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=41  L3-B2 on fire (96%): sending 1 water tether (D3) to L3-B2 to cool it.
t=41  L2-A4 on fire (93%): sending 1 water tether (D4) to L2-A4 to cool it.
t=42  Believes L1-A1, L1-A2, L1-A3 and 19 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 99%, L2-B1 100%, L2-B2 100%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A2 67%, L3-A3 87%, L3-A4 100%, L3-B1 100%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=42  L3-A2 on fire (67%): sending 1 water tether (D3) to L3-A2 to cool it.
t=42  L3-A3 on fire (87%): sending 1 water tether (D4) to L3-A3 to cool it.
t=43  Believes L1-A1, L1-A2, L1-A3 and 17 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 99%, L2-B3 100%, L2-B4 100%, L3-A1 100%, L3-A4 100%, L3-B1 100%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=43  L3-A1 on fire (100%): sending 1 water tether (D3) to L3-A1 to cool it.
t=43  L3-B3 on fire (100%): sending 1 water tether (D4) to L3-B3 to cool it.
t=44  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 100%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B2 99%, L2-B3 100%, L2-B4 100%, L3-A4 100%, L3-B1 100%, L3-B2 93%, L3-B4 100%; confidence 0.94).
t=44  L3-B1 on fire (100%): sending 1 water tether (D3) to L3-B1 to cool it.
t=44  L3-B2 on fire (93%): sending 1 water tether (D4) to L3-B2 to cool it.
t=45  Believes L1-A1, L1-A2, L1-A3 and 17 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 99%, L2-A3 100%, L2-A4 100%, L2-B1 100%, L2-B3 100%, L2-B4 100%, L3-A1 67%, L3-A2 96%, L3-A3 91%, L3-A4 100%, L3-B3 88%, L3-B4 100%; confidence 0.94).
t=45  L3-B3 on fire (88%): sending 1 water tether (D3) to L3-B3 to cool it.
t=45  L3-A2 on fire (96%): sending 1 water tether (D4) to L3-A2 to cool it.
t=46  Believes L1-A1, L1-A2, L1-A3 and 17 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 98%, L2-A3 100%, L2-A4 100%, L2-B1 99%, L2-B3 100%, L2-B4 100%, L3-A1 99%, L3-A3 100%, L3-A4 100%, L3-B1 88%, L3-B3 100%, L3-B4 100%; confidence 0.94).
t=46  L3-A3 on fire (100%): sending 1 water tether (D4) to L3-A3 to cool it.
t=47  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 100%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 96%, L2-A3 100%, L2-A4 100%, L2-B1 98%, L2-B3 100%, L2-B4 99%, L3-A1 100%, L3-A4 100%, L3-B1 100%, L3-B2 91%, L3-B4 100%; confidence 0.94).
t=47  L3-B2 on fire (91%): sending 1 water tether (D3) to L3-B2 to cool it.
t=47  L3-A1 on fire (100%): sending 1 water tether (D4) to L3-A1 to cool it.
t=48  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 95%, L2-A3 100%, L2-A4 100%, L2-B1 98%, L2-B3 100%, L2-B4 98%, L3-A1 100%, L3-A2 93%, L3-A4 100%, L3-B1 100%, L3-B4 100%; confidence 0.94).
t=48  L3-B1 on fire (100%): sending 1 water tether (D3) to L3-B1 to cool it.
t=48  L3-A2 on fire (93%): sending 1 water tether (D4) to L3-A2 to cool it.
t=49  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A2 92%, L2-A3 99%, L2-A4 100%, L2-B1 96%, L2-B3 100%, L2-B4 98%, L3-A1 100%, L3-A3 87%, L3-A4 100%, L3-B3 86%, L3-B4 100%; confidence 0.94).
t=49  L3-B3 on fire (86%): sending 1 water tether (D3) to L3-B3 to cool it.
t=49  L3-A3 on fire (87%): sending 1 water tether (D4) to L3-A3 to cool it.
t=50  Believes L1-A1, L1-A2, L1-A3 and 15 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A3 98%, L2-A4 100%, L2-B1 95%, L2-B3 100%, L2-B4 97%, L3-A1 100%, L3-A4 100%, L3-B2 82%, L3-B3 99%, L3-B4 100%; confidence 0.93).
t=50  L3-B2 on fire (82%): sending 1 water tether (D4) to L3-B2 to cool it.
t=51  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 100%, L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A3 98%, L2-A4 100%, L2-B1 93%, L2-B3 100%, L2-B4 97%, L3-A1 100%, L3-A2 85%, L3-A4 100%, L3-B1 91%, L3-B2 98%, L3-B4 100%; confidence 0.93).
t=51  L3-A2 on fire (85%): sending 1 water tether (D3) to L3-A2 to cool it.
t=52  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 99%, L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A3 98%, L2-A4 99%, L2-B1 94%, L2-B3 100%, L2-B4 96%, L3-A1 100%, L3-A2 99%, L3-A3 72%, L3-A4 100%, L3-B1 99%, L3-B4 100%; confidence 0.93).
t=52  L3-A3 on fire (72%): sending 1 water tether (D4) to L3-A3 to cool it.
t=53  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 99%, L1-A2 100%, L1-A3 100%, L1-A4 99%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A3 97%, L2-A4 99%, L2-B1 92%, L2-B3 100%, L2-B4 95%, L3-A1 100%, L3-A3 97%, L3-A4 100%, L3-B1 100%, L3-B3 67%, L3-B4 100%; confidence 0.93).
t=53  L3-B3 on fire (67%): sending 2 water tethers (D3, D4) to L3-B3 to cool it.
t=54  L3-A3 on fire (100%): sending 2 water tethers (D3, D4) to L3-A3 to cool it.
t=55  Believes L1-A1, L1-A2, L1-A3 and 17 more burning (L1-A1 99%, L1-A2 99%, L1-A3 100%, L1-A4 98%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A3 93%, L2-A4 99%, L2-B1 85%, L2-B3 100%, L2-B4 93%, L3-A1 100%, L3-A2 58%, L3-A4 100%, L3-B1 100%, L3-B2 93%, L3-B3 98%, L3-B4 100%; confidence 0.93).
t=55  L3-A2 on fire (58%): sending 2 water tethers (D3, D4) to L3-A2 to cool it.
t=56  Believes L1-A1, L1-A2, L1-A3 and 15 more burning (L1-A1 99%, L1-A2 99%, L1-A3 100%, L1-A4 98%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A3 94%, L2-A4 99%, L2-B3 100%, L2-B4 92%, L3-A1 100%, L3-A4 100%, L3-B1 100%, L3-B2 97%, L3-B3 100%, L3-B4 100%; confidence 0.93).
t=56  L3-B3 on fire (100%): sending 2 water tethers (D3, D4) to L3-B3 to cool it.
t=57  L3-B2 on fire (100%): sending 2 water tethers (D3, D4) to L3-B2 to cool it.
t=59  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 98%, L1-A2 99%, L1-A3 100%, L1-A4 98%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-A3 92%, L2-A4 99%, L2-B3 100%, L2-B4 89%, L3-A1 100%, L3-A3 91%, L3-A4 100%, L3-B1 100%, L3-B2 100%, L3-B3 100%, L3-B4 100%; confidence 0.93).
t=60  Believes L1-A1, L1-A2, L1-A3 and 17 more burning (L1-A1 98%, L1-A2 99%, L1-A3 100%, L1-A4 98%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A3 90%, L2-A4 99%, L2-B3 100%, L2-B4 88%, L3-A1 100%, L3-A2 69%, L3-A3 97%, L3-A4 100%, L3-B1 100%, L3-B2 100%, L3-B3 100%, L3-B4 100%; confidence 0.93).
t=60  L3-A2 on fire (69%): sending 2 water tethers (D3, D4) to L3-A2 to cool it.
t=61  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 98%, L1-A2 99%, L1-A3 100%, L1-A4 99%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A3 88%, L2-A4 99%, L2-B3 100%, L2-B4 87%, L3-A1 100%, L3-A3 98%, L3-A4 100%, L3-B1 100%, L3-B2 99%, L3-B3 99%, L3-B4 100%; confidence 0.93).
t=62  L1-B4 on fire (100%): sending 2 water tethers (D3, D4) to L1-B4 to cool it.
t=64  L1-A2 on fire (99%): sending 1 water tether (D3) to L1-A2 to cool it.
t=65  Believes L1-A1, L1-A3, L1-A4 and 14 more burning (L1-A1 98%, L1-A3 100%, L1-A4 98%, L1-B1 98%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A4 98%, L2-B3 100%, L2-B4 88%, L3-A1 100%, L3-A3 100%, L3-A4 99%, L3-B1 99%, L3-B2 99%, L3-B3 97%, L3-B4 99%; confidence 0.93).
t=65  L1-B4 on fire (100%): sending 1 water tether (D3) to L1-B4 to cool it.
t=66  Believes L1-A1, L1-A3, L1-A4 and 15 more burning (L1-A1 99%, L1-A3 100%, L1-A4 86%, L1-B1 98%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A4 98%, L2-B3 100%, L2-B4 88%, L3-A1 100%, L3-A2 70%, L3-A3 100%, L3-A4 99%, L3-B1 99%, L3-B2 97%, L3-B3 97%, L3-B4 99%; confidence 0.93).
t=66  L1-A4 on fire (86%): sending 2 water tethers (D3, D4) to L1-A4 to cool it.
t=67  Believes L1-A1, L1-A3, L1-B1 and 14 more burning (L1-A1 99%, L1-A3 100%, L1-B1 98%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A4 99%, L2-B3 100%, L2-B4 89%, L3-A1 99%, L3-A2 85%, L3-A3 99%, L3-A4 98%, L3-B1 99%, L3-B2 95%, L3-B3 95%, L3-B4 99%; confidence 0.93).
t=67  L1-A3 on fire (100%): sending 1 water tether (D3) to L1-A3 to cool it.
t=67  L1-B4 on fire (100%): sending 1 water tether (D4) to L1-B4 to cool it.
t=68  Believes L1-A1, L1-A2, L1-A3 and 15 more burning (L1-A1 99%, L1-A2 70%, L1-A3 100%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A4 99%, L2-B3 100%, L2-B4 89%, L3-A1 99%, L3-A2 91%, L3-A3 99%, L3-A4 98%, L3-B1 98%, L3-B2 93%, L3-B3 94%, L3-B4 99%; confidence 0.93).
t=71  Believes L1-A1, L1-A2, L1-A3 and 16 more burning (L1-A1 99%, L1-A2 100%, L1-A3 100%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 98%, L2-A3 86%, L2-A4 100%, L2-B3 100%, L2-B4 97%, L3-A1 98%, L3-A2 96%, L3-A3 98%, L3-A4 98%, L3-B1 98%, L3-B2 87%, L3-B3 89%, L3-B4 98%; confidence 0.93).
t=71  L1-A2 on fire (100%): sending 1 water tether (D3) to L1-A2 to cool it.
t=72  Believes L1-A1, L1-A3, L1-B1 and 15 more burning (L1-A1 99%, L1-A3 100%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 98%, L2-A3 86%, L2-A4 100%, L2-B3 100%, L2-B4 98%, L3-A1 98%, L3-A2 97%, L3-A3 98%, L3-A4 98%, L3-B1 98%, L3-B2 84%, L3-B3 88%, L3-B4 98%; confidence 0.93).
t=72  L2-B4 on fire (98%): sending 2 water tethers (D3, D4) to L2-B4 to cool it.
t=73  Believes L1-A1, L1-A3, L1-B1 and 14 more burning (L1-A1 100%, L1-A3 100%, L1-B1 99%, L1-B2 100%, L1-B4 100%, L2-A1 98%, L2-A3 92%, L2-A4 100%, L2-B3 100%, L3-A1 97%, L3-A2 96%, L3-A3 98%, L3-A4 98%, L3-B1 97%, L3-B2 86%, L3-B3 90%, L3-B4 98%; confidence 0.93).
t=73  L1-A3 on fire (100%): sending 1 water tether (D3) to L1-A3 to cool it.
t=73  L1-B4 on fire (100%): sending 1 water tether (D4) to L1-B4 to cool it.
t=74  Believes L1-A1, L1-A3, L1-A4 and 15 more burning (L1-A1 100%, L1-A3 100%, L1-A4 83%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A3 93%, L2-A4 100%, L2-B3 100%, L3-A1 97%, L3-A2 97%, L3-A3 98%, L3-A4 98%, L3-B1 97%, L3-B2 85%, L3-B3 91%, L3-B4 99%; confidence 0.93).
t=74  L2-A4 on fire (100%): sending 2 water tethers (D3, D4) to L2-A4 to cool it.
t=76  Believes L1-A1, L1-A3, L1-A4 and 14 more burning (L1-A1 100%, L1-A3 100%, L1-A4 99%, L1-B1 100%, L1-B2 100%, L1-B4 100%, L2-A1 99%, L2-A3 97%, L2-B3 100%, L3-A1 97%, L3-A2 97%, L3-A3 98%, L3-A4 99%, L3-B1 97%, L3-B2 85%, L3-B3 93%, L3-B4 99%; confidence 0.93).
t=76  L1-A4 on fire (99%): sending 2 water tethers (D3, D4) to L1-A4 to cool it.
t=77  Believes L1-A1, L1-A3, L1-B1 and 12 more burning (L1-A1 100%, L1-A3 100%, L1-B1 95%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-B3 100%, L3-A1 98%, L3-A2 97%, L3-A3 98%, L3-A4 100%, L3-B1 97%, L3-B2 87%, L3-B3 94%, L3-B4 100%; confidence 0.93).
t=77  L1-B1 on fire (95%): sending 1 water tether (D3) to L1-B1 to cool it.
t=77  L1-A3 on fire (100%): sending 1 water tether (D4) to L1-A3 to cool it.
t=78  Believes L1-A1, L1-A3, L1-B2 and 11 more burning (L1-A1 100%, L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-B3 100%, L3-A1 98%, L3-A2 98%, L3-A3 99%, L3-A4 84%, L3-B1 97%, L3-B2 87%, L3-B3 95%, L3-B4 100%; confidence 0.93).
t=78  L3-A4 on fire (84%): sending 2 water tethers (D3, D4) to L3-A4 to cool it.
t=79  Believes L1-A1, L1-A3, L1-B2 and 10 more burning (L1-A1 97%, L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-B3 100%, L3-A1 98%, L3-A2 98%, L3-A3 100%, L3-B1 97%, L3-B2 87%, L3-B3 95%, L3-B4 100%; confidence 0.92).
t=79  L1-A3 on fire (100%): sending 1 water tether (D3) to L1-A3 to cool it.
t=79  L1-B4 on fire (100%): sending 1 water tether (D4) to L1-B4 to cool it.
t=81  Believes L1-A3, L1-B2, L1-B4 and 9 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-B3 100%, L3-A1 98%, L3-A2 99%, L3-A3 100%, L3-B1 98%, L3-B2 88%, L3-B3 99%, L3-B4 93%; confidence 0.92).
t=81  L3-B4 on fire (93%): sending 2 water tethers (D3, D4) to L3-B4 to cool it.
t=82  Believes L1-A3, L1-B2, L1-B4 and 8 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A1 100%, L2-B3 100%, L3-A1 99%, L3-A2 100%, L3-A3 89%, L3-B1 99%, L3-B2 90%, L3-B3 100%; confidence 0.92).
t=82  L3-A3 on fire (89%): sending 2 water tethers (D3, D4) to L3-A3 to cool it.
t=83  Believes L1-A3, L1-B2, L1-B4 and 7 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A1 95%, L2-B3 100%, L3-A1 100%, L3-A2 100%, L3-B1 99%, L3-B2 92%, L3-B3 98%; confidence 0.92).
t=83  L3-B3 on fire (98%): sending 2 water tethers (D3, D4) to L3-B3 to cool it.
t=84  L3-A2 on fire (89%): sending 1 water tether (D3) to L3-A2 to cool it.
t=85  Believes L1-A3, L1-B2, L1-B4 and 4 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-A1 64%, L2-B3 100%, L3-B1 100%, L3-B3 99%; confidence 0.94).
t=85  L3-B3 on fire (99%): sending 1 water tether (D3) to L3-B3 to cool it.
t=86  Believes L1-A3, L1-B2, L1-B4 and 2 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-B3 100%, L3-B1 100%; confidence 0.94).
t=86  L3-B1 on fire (100%): sending 2 water tethers (D3, D4) to L3-B1 to cool it.
t=88  Believes L1-A3, L1-B2, L1-B4 and 1 more burning (L1-A3 100%, L1-B2 100%, L1-B4 100%, L2-B3 100%; confidence 0.94).
t=88  L1-B2 on fire (100%): sending 1 water tether (D3) to L1-B2 to cool it.
t=88  L2-B3 on fire (100%): sending 1 water tether (D4) to L2-B3 to cool it.
```
