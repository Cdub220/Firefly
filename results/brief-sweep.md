# Commander's brief sweep

`defaults`: plans demo-6, vessel-3x8, tower-5x4; modes freeze, blind, flashover; seeds 7, 8, 9; 120 ticks; closed loop, same allocator.

```
BY PLAN
group       brain            n      fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
demo-6      ours             9              33               1               1              34               1              68             4.6               0              14               0
demo-6      kalman           9              33               1               1              34               1            48.2             3.9               0            11.3               0
demo-6      kalman-source    9              33               1               1              34               1            59.3             4.8               0            34.7               0

vessel-3x8  ours             9              33               1               1              34               1              68             3.8               0            54.1               0
vessel-3x8  kalman           9            31.9               1               1            32.9               1            34.9             2.4             0.2            10.7               0
vessel-3x8  kalman-source    9              33               1               1              34               1           113.6             6.2               0           105.9               0

tower-5x4   ours             9              49               1               1              50               1            97.3             5.3               0              29             0.1
tower-5x4   kalman           9              49               1               1              50               1            58.4             3.6               0               9               0
tower-5x4   kalman-source    9              49               1               1              50               1             124             6.9               0            83.9               0

* = mean over the runs where it happened; the rest never did (containedAt / extinguishedAt).

BY MODE
group       brain            n      fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
freeze      ours             9            38.3               1               1            39.3               1            77.8             4.5               0            32.6               0
freeze      kalman           9            38.3               1               1            39.3               1              54             3.6               0             9.8               0
freeze      kalman-source    9            38.3               1               1            39.3               1             188            10.2               0           190.3               0

blind       ours             9            38.3               1               1            39.3               1              78             4.6               0            31.4               0
blind       kalman           9            37.2               1               1            38.2               1            34.4             2.8             0.2              11               0
blind       kalman-source    9            38.3               1               1            39.3               1            44.7             3.7               0            20.8               0

flashover   ours             9            38.3               1               1            39.3               1            77.6             4.7               0            33.1             0.1
flashover   kalman           9            38.3               1               1            39.3               1            53.1             3.5               0            10.2               0
flashover   kalman-source    9            38.3               1               1            39.3               1            64.2             4.0               0            13.3               0

* = mean over the runs where it happened; the rest never did (containedAt / extinguishedAt).

OVERALL
group       brain            n      fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
all         ours            27            38.3               1               1            39.3               1            77.8             4.6               0            32.4             0.0
all         kalman          27            38.0               1               1            39.0               1            47.2             3.3             0.1            10.3               0
all         kalman-source   27            38.3               1               1            39.3               1            99.0             6.0               0            74.8               0

* = mean over the runs where it happened; the rest never did (containedAt / extinguishedAt).
```
