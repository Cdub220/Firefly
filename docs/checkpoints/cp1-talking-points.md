# Checkpoint 1 · video script and talking points

Deadline: Sun Sept 13, 12:00 AM ET (Sat midnight). Submission: 60-second video plus repo link. Rubric: Innovation 30, Technical 25, Business 25, Presentation 20. At hour 12 a top Innovation score means a breakthrough concept, not a finished build. Sell the question.

The formal checkpoint record is `cp1.md`. This file is what you say.

## Set-up before recording

```bash
git checkout main && git pull && npm install
npm run dev          # open http://localhost:5173, it runs the freeze case on load
```

Backup if the dev server misbehaves: open `results/viewer-freeze.html` in a browser. No server needed.

Record with the page at full width so all three panels sit side by side. Start at tick 3 (the page opens there). Have a terminal ready with `npm run evidence` already run so the table is on screen when you need it.

## Video script, 60 seconds

**Beat 1 · the question · 0:00 to 0:15.** *[Screen: the split view, paused at tick 3, all three panels agreeing.]*

When a building catches fire, the fire destroys the sensors that report it. Smoke makes them read cold. Heat saturates them. A room flashes over and every sensor in it dies at once. That is not noise. Noise averages out. This is corruption: readings wrong in structured, coordinated ways. And the textbook estimator does not get fuzzy under corruption. It gets confidently wrong.

**Beat 2 · the evidence · 0:15 to 0:50.** *[Press Play at 4 per second. Let it run to about tick 40. Point as you go.]*

Six spaces, one sensor each. Left is the truth. Middle is our brain. Right is a Kalman filter, the standard tool. Both read the same sensors. At tick 5 we freeze the sensor in the burning room. It keeps reporting the same number. It looks healthy.

*[Around tick 9.]* Our brain notices the timestamp stopped moving. It crosses that sensor out and its confidence drops. Kalman keeps trusting it. Confidence 0.97.

*[Around tick 34, S3 flips to BURNED OUT.]* The room runs out of fuel. It is hot, but nothing is burning. Kalman still says burning, still 97 percent sure. It is wrong, and it has no way to know. Ours says maybe, because a dead sensor is a dead sensor.

*[Screen: the strip at the bottom.]* Every bar is one tick. Height is confidence. Red is wrong and sure. Kalman's row is red from tick 5 on. Ours never is. *[Cut to the evidence table.]* Same readings, same seed. Kalman confidently wrong on 65 percent of ticks. Ours, zero.

**Beat 3 · what changed, what is next · 0:50 to 1:00.**

What changed in our understanding today: being honest is not the same as being right. Our brain knows when it does not know, but when six sensors read 800 degrees it still will not commit. Next twelve hours: graded belief, a probability per space instead of one flat maybe, and a multi-level structure with fire climbing between floors.

## Talking points, if a judge asks

**Why is this a Defense track project?** The brief asks for an estimator that preserves useful knowledge of a critical system under a defined class of measurement and communication failures, with the decision-maker knowing both the estimate and whether it is supported. That is this, word for word. The FAQ says emergency operations qualify. Ships are the demo because the failure case is documented: the Bonhomme Richard burned for four days in port with its suppression system tagged out.

**Is the Kalman baseline fair, or a straw man?** Its process model is the structure's heat graph, the same physics our brain uses. It is the filter a competent engineer would build for this problem. It fails because it assumes independent noise, which is the assumption the brief tells you to break.

**How do you know the brain is not cheating?** It cannot import the world, the corruptor, or the eval harness. That is a lint rule, and there is a test that runs the linter on a fake violating file and asserts it fails. The observation object it receives has no "burning" field. Reproduce: `npm test`.

**What is "confidently wrong"?** A tick where the brain's burning set differs from truth while it reports confidence at or above 0.9. It is our operationalization of the brief's "false certainty." We would welcome a better one; calibration error is the alternative.

**When you say "maybe," is that not just avoiding the question?** No. The maybe set is what the allocator will act on. A scout goes to a maybe space to resolve it; a tether goes to a certain space to fight it. Kalman cannot make that distinction because everything it believes is at 97 percent. And a commander who has seen one confident call turn out wrong stops trusting all of them.

**Why should the maybe set be so large at tick 50?** Because five spaces at 830 degrees with one dead sensor genuinely fit several fire patterns, and temperature alone cannot separate them. That is an identifiability limit, and we will prove it as our negative result. Also, we agree the display should grade it: 95 percent for a space with a fresh honest sensor, 50 for the dead one. That is tonight's work, before the method freezes.

**Where is the fire spread model from?** Heat transfer along plan edges at per-edge rates, ignition above a threshold with a burning neighbor, fuel burn-down, cooling to ambient. It is linear on purpose so the comparison with Kalman is exact. The nonlinear effects we omit, smoke and radiative transfer among them, are listed in the writeup.

**What does a fire chief buy?** A commander's display and a dispatch order for a drone fleet that lives in the building. First market is ships and hangars, where the sensor network already exists and the failure case is documented. Then high-rises, where the alarm panel is the sensor network. Same software, different plan file.

**When did you freeze the method?** Not yet. Checkpoint 3, Sunday midnight ET. After that a test fails if the estimator files change, and every evaluation case is chosen after the hash.

## Things not to say

- Do not claim ours is more accurate about which rooms are burning. At checkpoint 1 it is more honest, and at checkpoint 2 it is more honest and lower error. Accuracy on the burning set is the graded-belief work.
- Do not say "AI" for the estimator. It is physics and hypothesis testing. Say so; it is a strength.
- Do not show the terminal sim line without the viewer. The terminal hides the maybe set and makes ours look worse than it is.
