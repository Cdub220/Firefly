# Checkpoints 2 + 3 · one video · script and shot list

One recording covering CP2 ("first evidence") and CP3 ("the method is frozen"). Target **2:00**; the `‖` marks are real pauses. About 150 words a minute. If the form insists on 60 seconds per checkpoint, cut at the marked split and submit the halves.

**What the rubric rewards, and where this video earns it**

| Rubric | Weight | Where it lands |
|---|---|---|
| Innovation | 30% | Beat 1 (the insight), Beat 4 (same brain, different building, nothing retrained) |
| Technical | 25% | Beat 2 (the number, five seeds, three modes), Beat 5 (240-cell sweep, where ours loses, the freeze) |
| Business value | 25% | Beat 4 (structure is a JSON file: ships, towers, data centers) and Beat 6 (a judge can break it themselves) |
| Presentation | 20% | Screen recording of the live app, one number per beat, no terminal except the two tables |

The brief also asks, every checkpoint, *what changed in your understanding*. Beat 5 answers it with numbers. Almost no team will.

## Set-up before recording

```bash
git checkout main && git pull && npm install
npm run dev              # http://localhost:5173
npm run evidence         # leave this terminal visible for Beat 2
```

Browser at full width, 1400 px or wider. Open these tabs in order so you only switch tabs while recording:

1. `http://localhost:5173/?view=split&plan=demo-6` — pick `demo-6` in the top-right select once so the store remembers it; press **freeze the ignition sensor**-equivalent: mode *freeze*, which sensors *S3*, break at tick *5*, Run. Leave it paused at tick 3.
2. Terminal with `npm run evidence` output on screen.
3. `http://localhost:5173/?view=scene&plan=vessel-3x8&t=20`
4. `http://localhost:5173/?view=scene&plan=demo-6&t=1` — the 3D tab with the **Break it** panel visible on the left.
5. Terminal with the sweep table (Dean's branch: `npm run sweep -- --quick`; 0.9 s, 240 rows). Scroll so the `freeze` rows for `ignition`, `neighbor`, `far`, `random` are visible.

---

## Beat 1 · the claim · 0:00–0:15 · *[Tab 1, split view, paused at tick 3]*

Last night we showed the problem: freeze one sensor and a Kalman filter stays ninety-seven percent sure of the wrong answer. ‖ Today, two things. The number. And then everything a judge would need to break it themselves.

## Beat 2 · the number · 0:15–0:45 · *[Tab 1: press Play at 4 per second. Point as you go. Around tick 9, then cut to Tab 2 at the sentence "Across freeze, blind, and flashover".]*

Truth on the left. Our brain in the middle. Kalman on the right. Same six sensors. At tick five the sensor in the burning room freezes: it keeps reporting the old number, and it looks perfectly healthy. ‖ Ours checks it against the physics of the building, decides it can't be trusted, crosses it out, and drops its confidence. Kalman never notices. ‖ *[Tab 2]* Across freeze, blind, and flashover, five seeds each: Kalman is confidently wrong on sixty-four to seventy-two percent of ticks. Ours: zero. And ours still covers the true fire ninety-one percent of the time, with a four-degree error against Kalman's forty.

## Beat 3 · what changed since last night · 0:45–0:55 · *[stay on Tab 2]*

What changed in our understanding: being honest turned out to be the easy part. Ours never claims false certainty, but nine percent of the time the fire is somewhere it didn't list. Coverage, not confidence, is now the number we chase.

> **— CP2 cut ends here (0:55). CP3 cut starts here. —**

## Beat 4 · any building · 0:55–1:15 · *[Tab 3: vessel-3x8 at tick 20. Drag to orbit once. Pull the "show levels ≤" slider from 3 to 1 and back.]*

The brain doesn't know what building it's in. This is a three-deck structure from a different JSON file: same code, nothing retrained. Fire on deck one, climbing through the steel to deck two. Green spheres are sensors the brain can hear. The amber one is lying. ‖ A high-rise is another file. Stack effect up the stairwell is a number in that file, not a rewrite. That's the whole market slide in one sentence.

## Beat 5 · the sweep, and where we lose · 1:15–1:45 · *[Tab 5, sweep table]*

Tonight the method freezes, so every number after it comes from cases chosen after the hash. Before that, we swept it: five failure modes, three corruption budgets, four sensor placements, both brains, two hundred forty cells, under one second. ‖ Ours has zero false certainty in every cell. ‖ But here is what surprised us. Two places we lose. When the broken sensor is chosen at random and it saturates, our temperature error is four hundred degrees, as bad as Kalman's, because a pinned sensor in a cold room looks exactly like a fire we can't rule out. And on time to recovery, Kalman snaps back to the exact truth at tick twelve where ours never does, because ours keeps a maybe-set open. Honest, and slower to commit. ‖ We know why for both, and the sweep will tell us if the fix at checkpoint four helps.

## Beat 6 · break it yourself, and next · 1:45–2:00 · *[Tab 4: 3D tab, demo-6. Press "flashover" in the Break it panel. Scrub to the end: every sphere goes red, readout says 0 of 6 reporting. Press "freeze the ignition sensor": one amber sphere.]*

Every knob the failure model has is on this panel, generated from the type, so a judge can pick a structure, pick how to break the sensors, press run, and scrub. Flashover: every sensor dies, the brain hears nothing, and it says so. ‖ Next twelve hours: the allocator. When the brain can't separate two rooms, two scouts peel off to cover both. Uncertainty turned into action you can watch.

*Stop. Don't add anything.*

---

## Things not to say

- Do not say the method is frozen until `docs/06-freeze.md` exists with the hash. Say "freezes tonight" or, if Dean has run it before you record, "froze at commit …".
- Do not claim ours is more accurate on the burning set. It is more honest, and lower error on named targets; on random saturate it is not.
- Do not show the terminal sim line; the split view shows the maybe-set and the terminal hides it.
- The sweep so far is on demo-6 only. Say "the six-space structure" if asked; the larger plans are the next sweep axis.

## Numbers in this script, and where they come from

| Claim | Source |
|---|---|
| 64–72% Kalman false certainty, ours 0%, 91% coverage, 3.6–8 °C vs 42–115 °C error | `npm run evidence` on `main` (`results/evidence-cp2.json`) |
| 240 cells, 0.9 s, ours 0% false certainty everywhere | `npm run sweep -- --quick` on `dean-branch` |
| random saturate: ours 416 °C error vs Kalman 424 °C; ours 13% wrong dispatch | sweep row `demo-6 saturate 1 random` |
| time to recovery: Kalman 12.0 (2/2), ours "never (0/2)" on neighbor/far targets | sweep rows `demo-6 freeze 1 neighbor` / `far` |
| vessel-3x8 fire reaches deck 2 at t≈20 | `npm run sim -- --plan vessel-3x8 --ticks 40` |
