/**
 * The textbook baseline: a linear Kalman filter over per-space temperatures.
 *
 * Process model per tick, x_i' = x_i + sum_edges(rate_e * (x_j - x_i)) + g * b_i, i.e.
 * A = I + L with L the weighted graph Laplacian from the plan's edges — linear, so the
 * Kalman update is exact. b_i is 1 where the filter currently believes space i burns.
 *
 * It is competent, not a straw man: it knows the structure's heat physics exactly. What
 * it does NOT know is that readings can lie. It uses every reading it is given, assumes
 * independent Gaussian noise, and reports confidence from its own covariance — so once
 * converged it stays confident REGARDLESS of whether its readings are lies. That is the
 * point of the baseline and the thing we beat.
 */
import type { Belief, Brain, BrainConfig, Command, Observation, SpaceId } from '../shared/types';
import { add, identity, inverse, matmul, matvec, sub, transpose, zeros, type Mat } from './mat';

export const HEAT_GEN_C_PER_TICK = 40; // g: heat a burning space adds per tick
export const BURN_THRESHOLD_C = 200; // x_i above this => believed burning
const SIGMA_MEAS_C = 2; // sensor noise the filter assumes
const Q_PROCESS = 25; // process noise variance per space per tick
const P0 = 100; // initial variance per space
const CONF_STDDEV_SCALE_C = 50; // confidence = mean(1 - min(1, sqrt(P_ii)/50))

export function createKalmanBrain(config: BrainConfig): Brain {
  const spaceIds: SpaceId[] = config.plan.spaces.map((s) => s.id);
  const n = spaceIds.length;
  const idx = new Map<SpaceId, number>(spaceIds.map((id, i) => [id, i]));

  // A = I + L, constant for the life of the plan.
  const A: Mat = identity(n);
  for (const e of config.plan.edges) {
    const i = idx.get(e.a);
    const j = idx.get(e.b);
    if (i === undefined || j === undefined) continue;
    A[i]![i]! -= e.rate;
    A[i]![j]! += e.rate;
    A[j]![j]! -= e.rate;
    A[j]![i]! += e.rate;
  }
  const At = transpose(A);

  let x: number[] = [];
  let P: Mat = [];
  const init = (): void => {
    x = Array<number>(n).fill(config.plan.ambient);
    P = identity(n).map((row) => row.map((v) => v * P0));
  };
  init();

  return {
    step(obs: Observation): { belief: Belief; commands: Command[] } {
      // Predict: heat flows along edges; believed-burning spaces generate heat.
      const burning = x.map((t) => (t > BURN_THRESHOLD_C ? 1 : 0));
      x = matvec(A, x).map((v, i) => v + HEAT_GEN_C_PER_TICK * burning[i]!);
      P = add(matmul(matmul(A, P), At), identity(n).map((row) => row.map((v) => v * Q_PROCESS)));

      // Update: one row per reading. Every reading is used; none are doubted.
      const rows = obs.readings.filter((r) => idx.has(r.spaceId));
      const m = rows.length;
      if (m > 0) {
        const H: Mat = zeros(m, n);
        rows.forEach((r, k) => {
          H[k]![idx.get(r.spaceId)!] = 1;
        });
        const Ht = transpose(H);
        const R = identity(m).map((row) => row.map((v) => v * SIGMA_MEAS_C * SIGMA_MEAS_C));
        const S = add(matmul(matmul(H, P), Ht), R);
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
      const belief: Belief = {
        estimate,
        burningSet: spaceIds.filter((_id, i) => x[i]! > BURN_THRESHOLD_C),
        ambiguous: [],
        suspectSensors: [],
        confidence,
      };
      return { belief, commands: [] };
    },
    reset(): void {
      init();
    },
  };
}
