# Firefly

[![ci](https://github.com/Cdub220/Firefly/actions/workflows/ci.yml/badge.svg)](https://github.com/Cdub220/Firefly/actions/workflows/ci.yml)

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

## Working here with Claude Code

Hooks, skills, and a verifier agent are committed under `.claude/`. Start a session with `/dean` or `/chase`, do work with `/build <prompt>`, submit with `/checkpoint N`. Ownership, contract edits, and the freeze are enforced by hooks. Details in [docs/automation.md](docs/automation.md).

## Failure model

Every way a reading can be wrong lives in `src/corruption`, configured by `CorruptionConfig` (the chaos panel's API). The corruptor sees the clean observation and may key failures off true temperatures; it never imports the world, and the brain never learns the pattern except through the observations themselves.

**What can fail.** Four modes plus their combination:

- **freeze** — at `onset`, up to `k` sensors stick at their last value. The timestamp freezes too, but the temperature looks plausible: a stale reading masquerading as a live one.
- **blind** — at `onset`, up to `k` sensors report ambient regardless of truth, with a *current* timestamp. Smoke blinds the thermal camera exactly where it is hottest.
- **saturate** — every sensor whose true temp exceeds `saturateAt` pins at exactly that value. Physics, so no `k` limit.
- **flashover** — a space whose true temp exceeds `flashoverTemp` loses every sensor in it, fixed and drone-borne, permanently; drones caught inside report dead. Not bounded by `k`.
- **mixed** — all four at once (freeze and blind share the `k` budget), plus a 2% per-tick per-drone chance of comms loss that drops the drone's readings and self-report for that tick.

**Fixed or changing subset.** Freeze and blind pick their victims once at onset and hold them: a fixed subset. Saturate and flashover follow the fire: the corrupted subset grows as the fire spreads — and it is exactly the sensors nearest the truth.

**Magnitude.** Unbounded. A frozen or blinded sensor can be arbitrarily far from truth.

**Correlation.** Flashover is the correlated failure: one event silences every sensor in a space in the same instant. Independent-noise assumptions break here by design.

**What stays trusted.** The structure plan — geometry, edges, heat-transfer rates — and conservation physics on those edges. That trusted reference is what the estimator leans on when the sensors lie.

## Method freeze

Estimator logic freezes at hour 36 (Mon Sept 14, 12:00 AM ET, i.e. Sunday midnight). Record the commit hash here when it happens. Eval cases after that point are chosen post-freeze.

Freeze commit: `457de46847453854b93bdbaa807c0a17a2e844d4` (Sun Sept 13, hour 36). The record, the frozen failure model and estimator in one paragraph each, the full sweep table and the cells where ours loses are in [docs/06-freeze.md](docs/06-freeze.md); `src/eval/freeze.test.ts` fails the suite if a frozen file changes. What the sweep taught us is in [docs/07-what-surprised-us.md](docs/07-what-surprised-us.md).
