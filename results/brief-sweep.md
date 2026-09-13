# Commander's brief sweep

`defaults`: plans demo-6, vessel-3x8, tower-5x4; modes freeze, blind, flashover; seeds 7, 8, 9; 120 ticks; closed loop, same allocator.

```
BY PLAN
group       brain            n      fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
demo-6      ours             9              28               1               1              29               1            34.2             2.8             1.3            13.1             1.8
demo-6      kalman           9              33               1               1              34               1            48.2             3.9               0            11.3               0
demo-6      kalman-source    9              33               1               1              34               1            59.3             4.8               0            34.7               0

vessel-3x8  ours             9              28               1               1              29               1            16.2             0.6             1.7            45.4             9.2
vessel-3x8  kalman           9            31.9               1               1            32.9               1            34.9             2.4             0.2            10.7               0
vessel-3x8  kalman-source    9              33               1               1              34               1           113.6             6.2               0           105.9               0

tower-5x4   ours             9            36.1               1               1            37.1               1            18.1             2.5             0.6            22.9             2.3
tower-5x4   kalman           9              49               1               1              50               1            58.4             3.6               0               9               0
tower-5x4   kalman-source    9              49               1               1              50               1             124             6.9               0            83.9               0

* = mean over the runs where it happened; the rest never did (containedAt / extinguishedAt).

BY MODE
group       brain            n      fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
freeze      ours             9            28.3               1               1            29.3               1            21.3             2.0             1.2            27.7             4.3
freeze      kalman           9            38.3               1               1            39.3               1              54             3.6               0             9.8               0
freeze      kalman-source    9            38.3               1               1            39.3               1             188            10.2               0           190.3               0

blind       ours             9            30.3               1               1            31.3               1            25.9             2.1             1.3            27.9             4.4
blind       kalman           9            37.2               1               1            38.2               1            34.4             2.8             0.2              11               0
blind       kalman-source    9            38.3               1               1            39.3               1            44.7             3.7               0            20.8               0

flashover   ours             9            33.4               1               1            34.4               1            21.3             1.8               1            25.9             4.6
flashover   kalman           9            38.3               1               1            39.3               1            53.1             3.5               0            10.2               0
flashover   kalman-source    9            38.3               1               1            39.3               1            64.2             4.0               0            13.3               0

* = mean over the runs where it happened; the rest never did (containedAt / extinguishedAt).

OVERALL
group       brain            n      fireVolume     peakBurning     containedAt  extinguishedAt spacesBurnedOut     tetherTicks  retardantSpent     droneDeaths      wrongFloor          hedges
all         ours            27            30.7               1               1            31.7               1            22.9             2.0             1.2            27.1             4.4
all         kalman          27            38.0               1               1            39.0               1            47.2             3.3             0.1            10.3               0
all         kalman-source   27            38.3               1               1            39.3               1            99.0             6.0               0            74.8               0

* = mean over the runs where it happened; the rest never did (containedAt / extinguishedAt).
```
