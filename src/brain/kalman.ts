/**
 * The textbook baseline: a linear Kalman filter over per-space temperatures.
 *
 * Process model per tick is the world's own linear heat model (src/brain/physics.ts,
 * the same constants the world uses):
 *   x_i' = x_i + sum_edges(rate_e * (x_j - x_i)) + COOL * (ambient - x_i)
 *              + b_i * g_i * (FLAME_TEMP - x_i)
 * i.e. x' = A_t x + c_t with A_t = I + L - COOL*I - diag(b_i g_i) and c_t the constant
 * terms; L is the weighted graph Laplacian from the plan's edges. Linear, so the Kalman
 * update is exact. b_i is 1 where the filter currently believes space i burns (x_i above
 * BURN_THRESHOLD_C), g_i is GEN_RATE (x1.5 in a 'fuel' hazard space). Until hour 17 the
 * filter used a constant +40 C/tick source and no cooling, a model the world had stopped
 * using at hour 5; a baseline with the wrong physics is a straw man.
 *
 * It is competent, not a straw man: it knows the structure's heat physics exactly. What
 * it does NOT know is that readings can lie. It assumes independent Gaussian noise and
 * reports confidence from its own covariance, so once converged it stays confident
 * REGARDLESS of whether its readings are lies. That is the point of the baseline.
 *
 * Two variants, so the comparison isolates what our estimator buys:
 *   naive  (createKalmanBrain):       every reading is used, none doubted.
 *   gated  (createGatedKalmanBrain):  what a competent practitioner deploys — innovation
 *          gating. A reading whose normalized innovation squared (innov^2 / S_kk, chi-squared
 *          with one degree of freedom) exceeds GATE_CHI2 is dropped from the update, and a
 *          sensor rejected GATE_REACCEPT ticks in a row is accepted again, because a real
 *          step change (ignition is a 400 C innovation) must not be rejected forever.
 *          Rejected sensors are reported as suspect: the gate is the baseline's only doubt.
 *
 * P(burning) is the filter's own posterior, Phi((x_i - 200) / sqrt(P_ii)), not a hard
 * label: what the filter actually believes, scored like everyone else.
 */
import type { Belief, Brain, BrainConfig, Command, Observation, SensorId, SpaceId } from '../shared/types';
import { add, identity, inverse, matmul, matvec, sub, transpose, zeros, type Mat } from './mat';
import { COOL, FLAME_TEMP, FUEL_HAZARD_MULT, GEN_RATE } from './physics';

export const BURN_THRESHOLD_C = 200; // x_i above this => believed burning
const SIGMA_MEAS_C = 2; // sensor noise the filter assumes
const Q_PROCESS = 25; // process noise variance per space per tick
const P0 = 100; // initial variance per space
const CONF_STDDEV_SCALE_C = 50; // confidence = mean(1 - min(1, sqrt(P_ii)/50))
export const GATE_CHI2 = 9; // ~3 sigma, chi-squared(1) 99.7%
export const GATE_REACCEPT = 3; // consecutive rejections after which a sensor is accepted again

export type KalmanOptions = { gate?: boolean };

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |err| < 1.5e-7). */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const u = Math.abs(z) / Math.SQRT2; // Phi(z) = (1 + erf(z / sqrt 2)) / 2
  const t = 1 / (1 + 0.3275911 * u);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-u * u);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

export function createKalmanBrain(config: BrainConfig, opts: KalmanOptions = {}): Brain {
  const gate = opts.gate === true;
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);
  const n = spaceIds.length;
  const idx = new Map<SpaceId, number>(spaceIds.map((id, i) => [id, i]));

  // A0 = I + L - COOL*I, constant for the life of the plan; the generation term is added
  // per tick on the diagonal of the spaces the filter believes are burning.
  const A0: Mat = identity(n).map((row) => row.map((v) => v * (1 - COOL)));
  for (const e of config.plan.edges) {
    const i = idx.get(e.a);
    const j = idx.get(e.b);
    if (i === undefined || j === undefined) continue;
    A0[i]![i]! -= e.rate;
    A0[i]![j]! += e.rate;
    A0[j]![j]! -= e.rate;
    A0[j]![i]! += e.rate;
  }
  const genRate = config.plan.spaces.map((sp) => (sp.hazard === 'fuel' ? GEN_RATE * FUEL_HAZARD_MULT : GEN_RATE));
  const ambientTerm = COOL * config.plan.ambient;

  let x: number[] = [];
  let P: Mat = [];
  let rejectStreak = new Map<SensorId, number>();
  const init = (): void => {
    x = Array<number>(n).fill(config.plan.ambient);
    P = identity(n).map((row) => row.map((v) => v * P0));
    rejectStreak = new Map();
  };
  init();

  /** Innovation covariance for a set of rows, and the row -> state index map. */
  const measure = (rows: { spaceId: SpaceId }[]): { H: Mat; Ht: Mat; S: Mat } => {
    const m = rows.length;
    const H: Mat = zeros(m, n);
    rows.forEach((r, k) => {
      H[k]![idx.get(r.spaceId)!] = 1;
    });
    const Ht = transpose(H);
    const R = identity(m).map((row) => row.map((v) => v * SIGMA_MEAS_C * SIGMA_MEAS_C));
    const S = add(matmul(matmul(H, P), Ht), R);
    return { H, Ht, S };
  };

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      // Predict: heat flows along edges and leaks to ambient; believed-burning spaces are
      // pulled toward flame temperature.
      const burning = x.map((t) => (t > BURN_THRESHOLD_C ? 1 : 0));
      const A: Mat = A0.map((row, i) => row.map((v, j) => (i === j && burning[i] === 1 ? v - genRate[i]! : v)));
      const At = transpose(A);
      x = matvec(A, x).map((v, i) => v + ambientTerm + (burning[i] === 1 ? genRate[i]! * FLAME_TEMP : 0));
      P = add(matmul(matmul(A, P), At), identity(n).map((row) => row.map((v) => v * Q_PROCESS)));

      // Update: one row per reading. Naive: every reading is used. Gated: rows whose
      // normalized innovation fails the chi-squared test are dropped this tick.
      let rows = obs.readings.filter((r) => idx.has(r.spaceId));
      const rejected: SensorId[] = [];
      if (gate && rows.length > 0) {
        const { H, S } = measure(rows);
        const hx = matvec(H, x);
        const kept: typeof rows = [];
        rows.forEach((r, k) => {
          const innov = r.temp - hx[k]!;
          const nis = (innov * innov) / Math.max(1e-9, S[k]![k]!);
          const streak = rejectStreak.get(r.sensorId) ?? 0;
          if (nis > GATE_CHI2 && streak < GATE_REACCEPT) {
            rejectStreak.set(r.sensorId, streak + 1);
            rejected.push(r.sensorId);
          } else {
            rejectStreak.set(r.sensorId, 0);
            kept.push(r);
          }
        });
        rows = kept;
      }
      const m = rows.length;
      if (m > 0) {
        const { H, Ht, S } = measure(rows);
        const K = matmul(matmul(P, Ht), inverse(S));
        const hx = matvec(H, x);
        const innov = rows.map((r, k) => r.temp - hx[k]!);
        const gain = matvec(K, innov);
        x = x.map((v, i) => v + gain[i]!);
        P = matmul(sub(identity(n), matmul(K, H)), P);
      }

      const estimate: Record<SpaceId, number> = {};
      spaceIds.forEach((id, i) => {
        estimate[id] = x[i]!;
      });
      const confidence =
        spaceIds.reduce((acc, _id, i) => acc + (1 - Math.min(1, Math.sqrt(Math.max(0, P[i]![i]!)) / CONF_STDDEV_SCALE_C)), 0) / n;
      // The filter's own posterior probability that space i is above the burn threshold.
      const probability: Record<SpaceId, number> = {};
      spaceIds.forEach((id, i) => {
        const sd = Math.sqrt(Math.max(1e-9, P[i]![i]!));
        probability[id] = normalCdf((x[i]! - BURN_THRESHOLD_C) / sd);
      });
      const belief: Belief = {
        estimate,
        burningSet: spaceIds.filter((_id, i) => x[i]! > BURN_THRESHOLD_C),
        ambiguous: [],
        suspectSensors: rejected.sort(),
        confidence,
        probability,
      };
      return { belief, commands: [] };
    },
    reset(): void {
      init();
    },
  };
}

/** The practitioner's baseline: the same filter with innovation gating. */
export const createGatedKalmanBrain = (config: BrainConfig): Brain => createKalmanBrain(config, { gate: true });

// ---------------------------------------------------------------------------------------
// The fair baseline: an augmented-state filter that ESTIMATES each space's heat source.
//
// The naive and gated filters call a space burning when its temperature estimate is above
// 200 C. That rule is wrong on 65% of ticks of a CLEAN run (88% on the 3x8 plan), because
// a burned-out space or a space heated by its neighbour is hot without burning. That was
// measuring our chosen label rule, not the filter. The textbook answer, and the one a
// practitioner would deploy, is to put the unknown heat source in the state:
//
//   x' = A0 x + ambientTerm + q        (A0 = I + L - COOL*I, NO generation term)
//   q' = q                             (random walk, process noise Q_Q per space)
//
// and call a space burning when its estimated source q_i is significantly positive:
// q_i / sqrt(P_qq,i) > 3 and q_i > 10 C/tick. P(burning) = Phi((q_i - 10) / sd_i), the
// filter's own posterior that a non-trivial source is present. No fuel guess, no
// hand-written fire logic, no gating (a clean control). It separates hot from burning the
// way a linear filter can; what it still cannot do is doubt a reading.
// ---------------------------------------------------------------------------------------
export const SOURCE_MIN_C_PER_TICK = 10; // a source below this is not a fire
export const SOURCE_SIGMAS = 3; // q must be this many posterior sigmas above zero
const Q_SOURCE = 4; // random-walk process noise on q, (C/tick)^2 per space per tick
const P0_SOURCE = 100; // initial variance on q

export function createSourceKalmanBrain(config: BrainConfig): Brain {
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);
  const n = spaceIds.length;
  const N = 2 * n; // state = [x_1..x_n, q_1..q_n]
  const idx = new Map<SpaceId, number>(spaceIds.map((id, i) => [id, i]));

  // F = [[A0, I], [0, I]]: temperatures flow along edges and leak to ambient, plus the
  // per-space source; the source itself is a random walk.
  const F: Mat = identity(N);
  for (let i = 0; i < n; i++) {
    F[i]![i] = 1 - COOL;
    F[i]![n + i] = 1;
  }
  for (const e of config.plan.edges) {
    const i = idx.get(e.a);
    const j = idx.get(e.b);
    if (i === undefined || j === undefined) continue;
    F[i]![i]! -= e.rate;
    F[i]![j]! += e.rate;
    F[j]![j]! -= e.rate;
    F[j]![i]! += e.rate;
  }
  const Ft = transpose(F);
  const Q: Mat = identity(N).map((row, i) => row.map((v) => v * (i < n ? Q_PROCESS : Q_SOURCE)));
  const ambientTerm = COOL * config.plan.ambient;

  let z: number[] = [];
  let P: Mat = [];
  const init = (): void => {
    z = Array.from({ length: N }, (_, i) => (i < n ? config.plan.ambient : 0));
    P = identity(N).map((row, i) => row.map((v) => v * (i < n ? P0 : P0_SOURCE)));
  };
  init();

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      // Predict.
      z = matvec(F, z).map((v, i) => (i < n ? v + ambientTerm : v));
      P = add(matmul(matmul(F, P), Ft), Q);

      // Update: H picks temperatures only; every reading is used, none doubted.
      const rows = obs.readings.filter((r) => idx.has(r.spaceId));
      const m = rows.length;
      if (m > 0) {
        const H: Mat = zeros(m, N);
        rows.forEach((r, k) => {
          H[k]![idx.get(r.spaceId)!] = 1;
        });
        const Ht = transpose(H);
        const R = identity(m).map((row) => row.map((v) => v * SIGMA_MEAS_C * SIGMA_MEAS_C));
        const S = add(matmul(matmul(H, P), Ht), R);
        const K = matmul(matmul(P, Ht), inverse(S));
        const hz = matvec(H, z);
        const innov = rows.map((r, k) => r.temp - hz[k]!);
        const gain = matvec(K, innov);
        z = z.map((v, i) => v + gain[i]!);
        P = matmul(sub(identity(N), matmul(K, H)), P);
      }

      const estimate: Record<SpaceId, number> = {};
      const probability: Record<SpaceId, number> = {};
      const burningSet: SpaceId[] = [];
      let confSum = 0;
      spaceIds.forEach((id, i) => {
        estimate[id] = z[i]!;
        const q = z[n + i]!;
        const sd = Math.sqrt(Math.max(1e-9, P[n + i]![n + i]!));
        probability[id] = normalCdf((q - SOURCE_MIN_C_PER_TICK) / sd);
        if (q / sd > SOURCE_SIGMAS && q > SOURCE_MIN_C_PER_TICK) burningSet.push(id);
        confSum += 1 - Math.min(1, Math.sqrt(Math.max(0, P[i]![i]!)) / CONF_STDDEV_SCALE_C);
      });
      const belief: Belief = {
        estimate,
        burningSet,
        ambiguous: [],
        suspectSensors: [],
        confidence: confSum / n,
        probability,
      };
      return { belief, commands: [] };
    },
    reset(): void {
      init();
    },
  };
}
