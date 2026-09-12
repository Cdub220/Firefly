# Firefly

**When a structure catches fire, nobody knows where the fire is. We build the system that figures it out and sends the drones.**

Firefly is the decision brain for a firefighting drone swarm inside large enclosed structures: ships, high-rises, warehouses, hangars, data centers. The hard part is that the fire destroys the sensors that report it, and destroys them in *correlated* ways: smoke blinds thermal cameras so they read cold, heat saturates sensors, comms drop and readings freeze while looking current, and a space that flashes over kills every sensor inside it in the same instant. That is corruption, not noise. Estimators that assume independent noise converge confidently on the wrong answer and send drones to the wrong floor. Firefly estimates fire state under that failure model, reports honest ambiguity as a set of candidate states rather than a point, and allocates drones as both suppression assets and sensors.

Shared context for humans and coding agents: **[docs/00-README.md](docs/00-README.md)**. Read it first.

## Directory ownership

Two people work here in parallel with coding agents. Boundaries are strict and lint-enforced.

| Path | Owner | What it is |
|------|-------|-----------|
| `src/shared/types.ts` | **both** | The contract. Nobody edits without both owners agreeing. |
| `src/shared/` | both | RNG, plan loader. Imports nothing outside `shared`. |
| `src/world/` | Chase | Structure + fire simulation. Produces truth and clean observations. |
| `src/ui/` | Chase | React components, Zustand store, Three.js scene. |
| `src/brain/` | Dean | Estimation and allocation. Sees only `Observation`. |
| `src/corruption/` | Dean | Failure model applied between world and brain. |
| `src/eval/` | Dean | Headless harness and the four metrics. Runs under `tsx`. |
| `src/loop.ts` | both | The only file that wires world + corruption + brain. |
| `data/structures/` | both | Structure plans (JSON). A ship and a tower are different files, not different code. |

Import rules (see `eslint.config.js`, asserted by `src/arch.test.ts`):

- `src/brain` cannot import `world`, `corruption`, `eval`, `ui`, or `loop`. **The brain never sees ground truth or the corruption pattern.**
- `src/corruption` cannot import `world` or `brain`.
- `src/world` cannot import `brain` or `corruption`.
- `Math.random` is banned everywhere. Use `makeRng(seed)` from `src/shared/rng.ts`.

## Running

```bash
npm install
npm run sim        # headless, 50 ticks, one line per tick (tsx src/loop.ts --ticks 50 --seed 42)
npm test           # vitest: rng, plan, loop determinism, architecture rules
npm run lint       # eslint incl. boundary rules
npm run typecheck  # tsc --noEmit, strict
npm run dev        # vite UI at http://localhost:5173
npx tsx src/eval/index.ts --seed 42 --ticks 200   # metrics JSON
```

Same seed, same run. `src/loop.test.ts` asserts that seed 42 twice produces byte-identical traces.

## Data flow, one tick

```
world.tick(commands) -> { truth, obs }
corruptor.apply(obs) -> obs'          # readings + drone self-reports, damaged
brain.step(obs')     -> { belief, commands }
```

`truth` goes to the eval harness and the UI only. It never reaches the brain.

## Failure model

TODO(Dean). Must specify, per the Defense brief: what can fail (blinded / saturated / frozen / dead), whether the corrupted subset is fixed or changing, whether magnitude is bounded, how failures correlate (per-space flashover kills all sensors in that space), and what stays trusted (structure plan, conservation physics).

## Method freeze

Estimator logic freezes at hour 24 (Sun Sept 13, 12:00 PM ET). Record the commit hash here when it happens. Eval cases after that point are chosen post-freeze.

Freeze commit: _not yet_
