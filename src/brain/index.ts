/**
 * src/brain — owned by Dean.
 *
 * Estimation and allocation. Sees ONLY Observation objects. Never truth, never the
 * corruption pattern. Enforced by lint: this directory cannot import src/world,
 * src/corruption, src/eval, src/ui or src/loop.
 *
 * v1 — the real estimator:
 *   1. checkConsistency judges every reading against heat physics and history, yielding
 *      trusted readings and suspect sensors with reasons.
 *   2. Hypothesis sets: enumerate candidate burning sets around the previous belief,
 *      score each against the trusted readings (dropping the k largest residuals — up to
 *      k sensors may still be lying undetected), and keep every hypothesis within
 *      tolerance of the best.
 *   3. burningSet = the intersection of kept hypotheses (certainly burning). Spaces in
 *      some-but-not-all kept hypotheses are reported in `ambiguous`, grouped into
 *      connected components. Confidence = 1 / kept, times the consistency penalty.
 *      Two equally good explanations means confidence 0.5. That is what honest means.
 */
import { makeRng, type Rng } from '../shared/rng';
import { edgeMap } from '../shared/plan';
import { candidates, hotSpaces, predict, score } from './hypotheses';
import { fuelTicks, IGNITE } from './physics';
import { checkConsistency, updateHistory, type SensorHistory } from './consistency';
import { planCommands } from './commands';
import type { Belief, Brain, BrainConfig, Command, Observation, SpaceId } from '../shared/types';

// Default tolerance for undetected liars. NOT the prompt's 2: with one sensor per space
// (every current plan), k=2 lets the "no fire" hypothesis silently discard both sensors
// that contradict it — k must stay below the per-space sensor redundancy or the
// estimator is formally blind to small fires. Plans with doubled-up sensors can raise it
// via BrainConfig.k.
const DEFAULT_K = 1;
const SUSPECT_PENALTY = 0.8; // confidence multiplier per distrusted sensor
const TOLERANCE_FLOOR_C = 8; // hypotheses within max(8, 15% of best) of the best survive
const TOLERANCE_FRAC = 0.15;
const MIN_CONFIDENCE = 0.05;
// Confidence must also reflect FIT: 1/kept measures hypothesis-set collapse, and a pool
// whose every member misfits the data (e.g. a fire in a space no candidate names) would
// otherwise collapse to one bad hypothesis reported at confidence 1.00 — the exact false
// certainty this project exists to kill. Residuals up to the allowance are free (noise +
// model error); beyond it confidence decays as allowance/misfit.
const FIT_ALLOWANCE_C = 6;
const WARM_SEED_MARGIN_C = 30; // a reading this far above ambient seeds candidates too
// Certainty must be EARNED BY STABILITY: a belief that changed recently, or a hypothesis
// race that was contested recently, cannot claim near-certainty — otherwise a belief
// flip-flopping between wrong answers reports confidence 1.00 on the ticks it happens to
// collapse (probed: 8/40 such ticks on an unsensed-wing plan). Uncertainty does not
// vanish in one tick.
const STABLE_TICKS_FOR_CERTAINTY = 5;
const VOLATILE_CONF_CAP = 0.7;
// Fresh honest hot readings count. A space whose TRUSTED sensor has read above the
// structure's ignition temperature for this many consecutive ticks is burning by the
// physics (a space above ignition with fuel sustains itself) and is forced into every
// candidate: the hypothesis set may not omit it. A suspect sensor earns no such rule.
// "With fuel" is the other half: a burned-out space stays above ignition for as long as
// its neighbors burn, so the brain keeps an assumed fuel budget per believed-burning
// space and stops forcing it FUEL_MARGIN_TICKS before that budget runs out (it may have
// started counting a few ticks after the real ignition). From then on the hypothesis
// scoring decides, as it did before this rule existed.
const FORCED_STREAK_TICKS = 3;
const FUEL_MARGIN_TICKS = 5;
// A space's P(burning) may exceed this only after it has been in EVERY surviving
// hypothesis for AGREED_TICKS_FOR_CERTAINTY consecutive ticks. A forced hot space can
// drag a wrong neighbour into every survivor for a single tick (seen in blind mode);
// one tick of unanimity is not certainty.
const P_CAP_UNTIL_AGREED = 0.9;
const AGREED_TICKS_FOR_CERTAINTY = 2;

export function createBrain(config: BrainConfig): Brain {
  let rng: Rng = makeRng(config.seed).fork('brain');
  void rng; // reserved for hedging / tie-breaks. TODO(Dean).
  const k = config.k ?? DEFAULT_K;
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);
  const edges = edgeMap(config.plan);
  const neighborsOf = new Map<SpaceId, SpaceId[]>(
    spaceIds.map((id) => [id, (edges.get(id) ?? []).map((e) => e.b)]),
  );

  const ROLLOUT = 3; // score hypotheses over this many ticks of history

  let history: SensorHistory = new Map();
  let prevEstimate: Record<SpaceId, number> = {};
  let estHistory: Record<SpaceId, number>[] = []; // estimates of the last ROLLOUT ticks
  let prevBurning = new Set<SpaceId>();
  let stableTicks = 0; // consecutive ticks with an uncontested, unchanged burning set
  let lastBurningKey = '';
  let hotStreak = new Map<SpaceId, number>(); // consecutive ticks a space's trusted reading was above ignition
  let burnTicks = new Map<SpaceId, number>(); // ticks a space has been in the best hypothesis (fuel does not regenerate)
  let agreedStreak = new Map<SpaceId, number>(); // consecutive ticks a space was in every kept hypothesis
  let lastBelief: Belief | null = null; // carried forward under total blackout: last known fire, unconfirmed
  let prevCommands: Command[] = []; // last tick's commands, handed back to the command hook
  const init = (): void => {
    history = new Map();
    prevEstimate = {};
    for (const id of spaceIds) prevEstimate[id] = config.plan.ambient;
    estHistory = [];
    prevBurning = new Set();
    stableTicks = 0;
    lastBurningKey = '';
    hotStreak = new Map();
    burnTicks = new Map();
    agreedStreak = new Map();
    lastBelief = null;
    prevCommands = [];
  };
  init();

  /** Group ambiguous spaces into connected components over plan edges. */
  const components = (ids: Set<SpaceId>): SpaceId[][] => {
    const seen = new Set<SpaceId>();
    const out: SpaceId[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const group: SpaceId[] = [];
      const queue = [id];
      seen.add(id);
      while (queue.length) {
        const cur = queue.pop()!;
        group.push(cur);
        for (const n of neighborsOf.get(cur) ?? []) {
          if (ids.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      out.push(group.sort());
    }
    return out.sort((a, b) => a[0]!.localeCompare(b[0]!));
  };

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      // A sensor emitting a non-finite temperature yields no usable reading at all;
      // letting NaN in would poison every hypothesis score.
      const sane: Observation = {
        ...obs,
        readings: obs.readings.filter((r) => Number.isFinite(r.temp)),
      };
      updateHistory(history, sane);
      const { trusted, suspect } = checkConsistency(config.plan, sane, prevEstimate, history);

      // Total blackout: no reading can be trusted. Every hypothesis fits zero data equally,
      // so scoring would fall to the tie-break and report "no fire". A commander with no
      // data wants the last known fire, marked unconfirmed, not a clean sheet: carry the
      // previous belief forward at floor confidence and let physics move the estimate.
      if (trusted.length === 0 && lastBelief !== null) {
        const estimate = predict(config.plan, prevBurning, prevEstimate, 1);
        prevEstimate = estimate;
        estHistory.push(estimate);
        while (estHistory.length > ROLLOUT) estHistory.shift();
        stableTicks = 0;
        for (const id of spaceIds) hotStreak.set(id, 0); // no trusted above-ignition reading this tick
        for (const id of prevBurning) burnTicks.set(id, (burnTicks.get(id) ?? 0) + 1);
        const belief: Belief = {
          ...lastBelief,
          estimate,
          suspectSensors: suspect.map((x) => x.sensorId).sort(),
          confidence: MIN_CONFIDENCE,
        };
        lastBelief = belief;
        prevCommands = planCommands({ plan: config.plan, belief, kept: [new Set(belief.burningSet)], drones: sane.drones, prev: prevCommands });
        return { belief, commands: prevCommands };
      }

      // Seed candidates from hot READINGS and hot ESTIMATES: a fire whose sensors died
      // must stay in the pool — the estimate remembers it even when no reading does.
      // Also seed from the warmest merely-warm reading: an unsensed space's fire shows
      // up first as unexplained warmth next door, below any burning threshold.
      const warmest = trusted.reduce(
        (a, r) => (r.temp > (a?.temp ?? config.plan.ambient + WARM_SEED_MARGIN_C) ? r : a),
        undefined as { temp: number; spaceId: SpaceId } | undefined,
      );
      const hotSeeds = [
        ...new Set([
          ...hotSpaces(trusted),
          ...spaceIds.filter((id) => prevEstimate[id]! > 200),
          ...(warmest ? [warmest.spaceId] : []),
        ]),
      ];
      // Score each candidate by rolling physics from the estimate of ROLLOUT ticks ago
      // to the present and comparing against the current readings. Ties resolve toward
      // the hypothesis that needs no liars (full), then the smaller claim.
      const from = estHistory[0] ?? prevEstimate;
      const steps = Math.max(1, estHistory.length);
      // Forced spaces: trusted reading above ignition for FORCED_STREAK_TICKS in a row.
      // A tick without a trusted above-ignition reading (sensor suspect, dead, or cool)
      // breaks the streak.
      const hotNow = new Set(trusted.filter((r) => r.temp > IGNITE).map((r) => r.spaceId));
      for (const id of spaceIds) hotStreak.set(id, hotNow.has(id) ? (hotStreak.get(id) ?? 0) + 1 : 0);
      const forced = new Set(
        spaceIds.filter(
          (id) =>
            (hotStreak.get(id) ?? 0) >= FORCED_STREAK_TICKS &&
            (burnTicks.get(id) ?? 0) < fuelTicks(config.plan, id) - FUEL_MARGIN_TICKS,
        ),
      );
      const sets = candidates(config.plan, prevBurning, hotSeeds, forced);
      const scored = sets
        .map((set) => ({ set, ...score(config.plan, set, trusted, from, k, steps) }))
        .sort((a, b) => a.s - b.s || a.full - b.full || a.set.size - b.set.size);
      const best = scored[0]!;
      const tolerance = Math.max(TOLERANCE_FLOOR_C, TOLERANCE_FRAC * best.s);
      const kept = scored.filter((x) => x.s <= best.s + tolerance);

      // Certainly burning: what every surviving explanation agrees on. If they agree on
      // nothing (disjoint explanations, or "no fire" among the survivors), report the
      // BEST explanation rather than the empty set: naming no fire while one burns is
      // the one unacceptable failure mode, and the alternatives stay visible in
      // `ambiguous` with confidence lowered accordingly.
      let burning = kept
        .map((x) => x.set)
        .reduce((acc, s) => new Set([...acc].filter((id) => s.has(id))));
      const unanimous = new Set(burning);
      if (burning.size === 0) burning = best.set;
      for (const id of spaceIds) agreedStreak.set(id, unanimous.has(id) ? (agreedStreak.get(id) ?? 0) + 1 : 0);

      const union = new Set<SpaceId>(kept.flatMap((x) => [...x.set]));
      const contested = new Set<SpaceId>([...union].filter((id) => !burning.has(id)));
      const ambiguous = kept.length > 1 ? components(contested) : [];

      // Stability accounting: an uncontested race with an unchanged, WELL-FITTING answer
      // earns a stable tick; a contested race, a changed answer, or a misfit resets the
      // counter. Fit must be part of stability: a wrong-but-stable belief whose misfit
      // dips under the allowance for a single tick would otherwise spike to 1.00
      // (verified on slow-edge plans with an unsensed burning space).
      const burningKey = [...burning].sort().join(',');
      if (kept.length === 1 && burningKey === lastBurningKey && best.s <= FIT_ALLOWANCE_C) {
        stableTicks += 1;
      } else {
        stableTicks = 0;
      }
      lastBurningKey = burningKey;

      const fit = best.s <= FIT_ALLOWANCE_C ? 1 : FIT_ALLOWANCE_C / best.s;
      const raw = (1 / kept.length) * Math.pow(SUSPECT_PENALTY, suspect.length) * fit;
      const capped =
        stableTicks < STABLE_TICKS_FOR_CERTAINTY ? Math.min(raw, VOLATILE_CONF_CAP) : raw;
      // No evidence means no confidence, however comfortable the sole hypothesis is.
      const confidence =
        trusted.length === 0
          ? MIN_CONFIDENCE
          : Math.min(1, Math.max(MIN_CONFIDENCE, capped));

      // Estimate: trusted readings where present; the best hypothesis's physics
      // elsewhere (one step from last tick's estimate — the current-tick prediction).
      const predicted = predict(config.plan, best.set, prevEstimate, 1);
      const direct = new Map<SpaceId, { sum: number; n: number }>();
      for (const r of trusted) {
        const acc = direct.get(r.spaceId) ?? { sum: 0, n: 0 };
        direct.set(r.spaceId, { sum: acc.sum + r.temp, n: acc.n + 1 });
      }
      const estimate: Record<SpaceId, number> = {};
      for (const id of spaceIds) {
        const d = direct.get(id);
        estimate[id] = d ? d.sum / d.n : predicted[id]!;
      }

      // Graded belief: weight each kept hypothesis by exp(-(score - best) / tolerance),
      // so one at the edge of tolerance weighs e^-1 of the best, and P(burning) of a
      // space is the weighted fraction of kept hypotheses containing it. Every space gets
      // a value; a space in no hypothesis is 0. A distrusted sensor lowers certainty about
      // ITS OWN space only, so the consistency penalty applies per space, not globally.
      const weights = kept.map((x) => Math.exp(-(x.s - best.s) / tolerance));
      const weightSum = weights.reduce((a, b) => a + b, 0);
      const suspectIds = new Set(suspect.map((s) => s.sensorId));
      const suspectsInSpace = new Map<SpaceId, number>();
      for (const r of sane.readings) {
        if (suspectIds.has(r.sensorId)) suspectsInSpace.set(r.spaceId, (suspectsInSpace.get(r.spaceId) ?? 0) + 1);
      }
      const probability: Record<SpaceId, number> = {};
      for (const id of spaceIds) {
        let p = 0;
        kept.forEach((x, i) => {
          if (x.set.has(id)) p += weights[i]!;
        });
        p = weightSum > 0 ? p / weightSum : 0;
        p *= Math.pow(SUSPECT_PENALTY, suspectsInSpace.get(id) ?? 0);
        if ((agreedStreak.get(id) ?? 0) < AGREED_TICKS_FOR_CERTAINTY) p = Math.min(p, P_CAP_UNTIL_AGREED);
        probability[id] = Math.min(1, Math.max(0, p));
      }

      // Grow next tick's candidates from the best explanation, not the (possibly
      // empty-intersection) reported set: the candidate generator needs a fire to grow.
      prevEstimate = estimate;
      estHistory.push(estimate);
      while (estHistory.length > ROLLOUT) estHistory.shift();
      prevBurning = new Set(best.set);
      for (const id of best.set) burnTicks.set(id, (burnTicks.get(id) ?? 0) + 1);

      const belief: Belief = {
        estimate,
        burningSet: [...burning].sort(),
        ambiguous,
        suspectSensors: suspect.map((s) => s.sensorId).sort(),
        confidence,
        probability,
      };
      lastBelief = belief;
      prevCommands = planCommands({ plan: config.plan, belief, kept: kept.map((x) => x.set), drones: sane.drones, prev: prevCommands });
      return { belief, commands: prevCommands };
    },
    reset(): void {
      rng = makeRng(config.seed).fork('brain');
      init();
    },
  };
}
