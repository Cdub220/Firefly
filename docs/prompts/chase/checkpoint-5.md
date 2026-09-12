# Chase · Checkpoint 5 · hour 40 · Mon 4:00 AM ET

**Goal.** The comparison a judge remembers: baseline on the left, ours on the right, same truth, same broken sensors, a containment counter ticking up faster on the left. Then polish for recording. The stretch is the high-rise plan, which is already a file from checkpoint 2, so it is cheap: load it, run it, say "same brain, different building, nothing retrained."

---

## Prompt 1 · Split-screen baseline and containment counter

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: the store runs both brains via runLoopMulti when brains === 'both'; traces has
'ours' and 'kalman' with identical obs per tick. SplitView renders truth/belief/diff for
one brain. Dean's eval has pure metric functions in src/eval/metrics.ts (computeMetrics);
importing them from src/ui is allowed.

TASK: a comparison mode.

  - CompareView.tsx: two belief scenes side by side, kalman left, ours right, one shared
    camera, the truth scene small above or between them. Each side shows its confidence
    bar and its burningSet size.
  - Containment counter: a line chart (plain SVG, no chart library) of spaces burning in
    truth over ticks, plus a vertical marker at cursor and at corruption onset. Because
    only the primary brain's commands drive the world, run TWO loops for this: one with
    kalman as primary, one with ours, and plot both truth curves. Add runCompare() to the
    store; call runLoopMulti twice with the same seed and config and different primary.
    Label the curves.
  - Scorecard strip: falseCertainty, wrongDispatch, ambiguityCoverage, timeToRecovery
    from computeMetrics for each brain on the current run, ours vs kalman, with the
    better one bolded. Numbers only; no prose.
  - Wrong-dispatch flash: at any tick where kalman's burningSet contains a non-burning
    space, flash that space red on the kalman side with a "WRONG FLOOR" tag. Apply the
    same rule to ours (excluding spaces inside an ambiguous group); if ours ever triggers,
    show it honestly.

TESTS: pure helpers: the containment series function (trace to number[]) and the
"better" comparator, unit tested.

DO NOT TOUCH: src/brain, src/corruption, src/eval (read only), src/world, src/loop.ts,
src/shared/types.ts.
```

---

## Prompt 2 · Demo polish and recording mode

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: The final demo runs live for a judge and must not depend on any network call.
Views: single (truth/belief/diff) and compare. Panels: scenario, chaos, drone table,
debug tables. Dean's brain may now return an optional briefing string per step.

TASK: make it demo-proof.

  - Recording mode (?demo=1 or a toggle): hides debug tables, enlarges fonts, shows only
    scenario presets, chaos presets, the scene, the briefing text, and the scorecard.
  - Briefing panel: render the step's briefing string if present as a CSS-only
    typewriter reveal under the belief view. If absent, render nothing.
  - A "Demo script" preset row that runs the five beats in order with one click each:
    1 clean run on vessel-3x8, 2 freeze the ignition sensor, 3 flashover, 4 compare mode
    with the same config, 5 load tower-5x4 with the same config. Each button sets state
    and runs. This is the live-demo control surface so nobody types during the pitch.
  - No network: the whole run is synchronous and local. Grep src/ui for fetch( and for
    dynamic imports of URLs and remove any. Add a test that fails if "fetch(" appears
    anywhere in src/ui.
  - Keyboard: space = play/pause, arrows = step, 1 to 5 = demo beats, c = compare toggle.
  - Error boundary around the scene so a render bug shows a message, not a white page.
  - `npm run build` must succeed and `npm run preview` must serve the demo from dist with
    no dev server. Verify and paste the build output.
  - Backup: a script `npm run export:trace` that writes results/demo-trace.json for the
    demo-script configs, and a "load trace" button hidden in non-demo mode that replays a
    JSON trace. If the sim ever breaks on stage, we replay.

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/world, src/loop.ts, src/shared/types.ts.
```

---

## Prompt 3 · Stretch: same brain, different building

```
You are working in the Firefly repo as Chase. Before anything else read CLAUDE.md, docs/00-README.md, docs/04-who-does-what.md, and src/shared/types.ts. Respect the directory ownership and lint boundaries in docs/04. Make reasonable assumptions instead of asking questions. Run `npm test && npm run lint && npm run typecheck` before you finish and do not report done unless all three are green. Commit in logical chunks with clear messages. Do not push. Finish by listing (1) what you built, (2) assumptions you made, (3) anything that did not work or that you skipped, (4) any contract change you need from Dean.

CONTEXT: data/structures/tower-5x4.json exists from checkpoint 2 (five levels, a
high-rate shaft chain, low-rate floors, no sensors on level 4). The estimator is frozen.
Nothing in src names a ship or a tower.

TASK: prove generality in twenty seconds of demo.

  1. Run `npx tsx src/loop.ts --plan tower-5x4 --ticks 120 --mode flashover --k 2` and
     the sweep restricted to tower-5x4 in quick mode (check the exact flags in
     src/eval/sweep.ts). Paste the summary rows in your report. If anything crashes on
     this plan, that is a bug in world or ui (yours) or a hidden assumption in brain
     (Dean's: report it, do not fix it, the brain is frozen).
  2. Layout: make sure layoutFor(tower-5x4) stacks five levels legibly and the shaft is
     visually distinct (a brighter vertical line). Set the level slicer default so the
     ignition level is visible.
  3. Add tower-5x4 as demo beat 5 if not already, with a caption in recording mode:
     "Same system. Different structure. Nothing retrained." Show the sweep row for it in
     the scorecard.
  4. Write docs/09-generality.md: half a page. The two plan files compared conceptually
     (which rates differ and why: conduction through steel versus stack effect up a
     stairwell), the command that runs both, the two scorecard rows, and one sentence on
     what a real building would need (alarm panel layout as a plan file, sprinkler flow
     switches as fixed sensors).

DO NOT TOUCH: src/brain, src/corruption, src/eval, src/loop.ts, src/shared/types.ts.
```
