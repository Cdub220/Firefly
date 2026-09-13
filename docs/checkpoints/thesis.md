# The thesis

For us and for anyone pitching, filming, or answering a judge. Written to be read aloud in pieces. Numbers are from `npm run evidence` on `main` at checkpoint 1 plus the checkpoint 2 estimator; update them when the sweep lands.

## What we claim

Inside a large enclosed structure on fire, our brain tells a commander where the fire is with a confidence that means something. When it does not know, it says so and names the possibilities. The Kalman filter, the standard tool for this job, gives a confident answer that is often wrong, and it cannot tell you which of its confident answers are the wrong ones.

## Where the information comes from

Two kinds of sensors.

**Fixed sensors** are hardwired into the structure. A Navy ship has a damage-control sensor network in every compartment. A high-rise has an alarm panel with smoke and heat detectors on every floor. These already exist and are already wired, so a drone system can plug into them on day one. Nothing has to be installed before the first fire.

**Drone-borne sensors.** Every drone carries a thermal sensor, so wherever a drone goes, we get a fresh reading from there. This is why the allocator matters: where we send a drone decides what we can see next.

In the split view, both kinds appear as the chip under each space.

## Why that information goes bad

The fire destroys the sensors that report it, and not one at a time.

- Smoke blinds a thermal camera so it reads room temperature exactly where it is hottest.
- Heat cooks a sensor until it pins at its maximum and stops rising.
- Comms drop and the last reading freezes on the panel while still looking current.
- A compartment flashes over and every sensor in it dies in the same second.

This is not noise. Noise is small, random, and averages out. This is corruption: readings that are wrong in structured, coordinated ways, and the pattern of which sensors are lying is not known to the estimator. The Defense brief calls this the difference between noise and corruption and asks for it to be defined explicitly. Ours is in `README.md` under "Failure model."

## What the Kalman baseline does with that

It assumes every reading is truth plus small random noise. It has no concept of a sensor that is lying. So it averages the frozen reading into its estimate forever, keeps calling that space burning, and reports 97 percent confidence, because its confidence comes from how much data it has seen, not from whether the data agrees with itself. On the freeze case it is confidently wrong on 65 percent of ticks after the sensor fails, and it looks identical when it is confidently right. A commander cannot tell the two apart.

We built it to be competent, not a straw man: its process model is the structure's heat graph, the same physics our brain uses.

## What our brain does instead

Three things the baseline does not do.

1. **Physics as a trusted reference.** Heat can only travel along the edges in the structure plan, at the rates in the plan. A sensor whose timestamp stopped advancing, a reading that dropped 400 degrees in one tick, a cold reading next to open doors onto 800 degree rooms, a fire appearing in a space with no heat path to any other fire: each contradicts physics, and that sensor gets flagged and dropped. A coordinated group of sensors all lying the same way cannot fool a conservation law.
2. **Hot is not burning.** It estimates temperatures, then asks which sets of burning spaces would produce those temperatures, rather than calling anything over 200 degrees a fire. A space can be hot because its neighbors are burning. A space that has run out of fuel is exactly that.
3. **Honest ambiguity.** It keeps every fire pattern that fits the surviving readings, drops the k worst-fitting sensors for each pattern so a hidden liar cannot dominate, and reports what all the patterns agree on as certain and the rest as maybe. Confidence is one over the number of surviving patterns. Two equally good explanations means 50 percent, and that is the truth.

On the same corrupted feed: 0 percent confidently wrong ticks, 91 percent coverage of the true fire, a quarter of the temperature error.

## The drones are the point

Belief feeds the allocator, which issues the commands. Each drone is both a firefighting asset and a moving sensor, so where we choose to fight decides what we can see next tick, and we solve those together. A tether goes where the fire is certain. A scout goes where the belief is split, because one fresh reading there collapses two patterns into one. When the brain cannot separate two spaces, it hedges and sends units to both. The allocator reads the belief and does not change it; the estimator is the hard part and is what freezes Sunday midnight.

## Why this generalizes

Nothing in the code names a ship. The structure is a JSON plan: spaces, edges with heat-transfer rates, sensor locations. A high-rise is a different file with stack-effect rates up the stairwell instead of conduction rates through steel. Same brain, nothing retrained. Ships and hangars first, then high-rises, apartment blocks, warehouses, parking structures, data centers.

## The one-sentence version

A wrong confident answer sends drones to the wrong floor. We built the estimator that says "22 or 30, cover both," and we can show the textbook filter failing to.

## The honest limits, stated before a judge asks

- A dead sensor is a dead sensor. When the only sensor in a space fails, no estimator can know that space burned out. Ours says "maybe." Kalman says "definitely." That is the difference, and it is the whole difference.
- When every space reads the same high temperature, temperature alone cannot say which ones have flames. That is a real identifiability limit, and it is our checkpoint 5 negative result, not a bug we are hiding.
- The heat model is linear. Smoke is not modeled. Sensor noise is Gaussian. The structures are synthetic. This is tested behavior, not deployment readiness.
