/**
 * Tiny dense-matrix helpers for the Kalman baseline. Plans have at most a few dozen
 * spaces, so plain number[][] and O(n^3) are plenty; no numeric library.
 */
export type Mat = number[][];

export const zeros = (rows: number, cols: number): Mat =>
  Array.from({ length: rows }, () => Array<number>(cols).fill(0));

export const identity = (n: number): Mat => {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i]![i] = 1;
  return m;
};

export const transpose = (a: Mat): Mat => {
  const m = zeros(a[0]?.length ?? 0, a.length);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i]!.length; j++) m[j]![i] = a[i]![j]!;
  return m;
};

export const add = (a: Mat, b: Mat): Mat =>
  a.map((row, i) => row.map((v, j) => v + b[i]![j]!));

export const sub = (a: Mat, b: Mat): Mat =>
  a.map((row, i) => row.map((v, j) => v - b[i]![j]!));

export const matmul = (a: Mat, b: Mat): Mat => {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0]?.length ?? 0;
  const m = zeros(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = a[i]![k]!;
      if (aik === 0) continue;
      for (let j = 0; j < cols; j++) m[i]![j]! += aik * b[k]![j]!;
    }
  }
  return m;
};

export const matvec = (a: Mat, x: number[]): number[] =>
  a.map((row) => row.reduce((acc, v, j) => acc + v * x[j]!, 0));

/** Inverse via Gauss-Jordan with partial pivoting. Throws on a singular matrix. */
export const inverse = (a: Mat): Mat => {
  const n = a.length;
  const aug: Mat = a.map((row, i) => [...row, ...identity(n)[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r]![col]!) > Math.abs(aug[pivot]![col]!)) pivot = r;
    }
    const pv = aug[pivot]![col]!;
    if (Math.abs(pv) < 1e-12) throw new Error('inverse: singular matrix');
    [aug[col], aug[pivot]] = [aug[pivot]!, aug[col]!];
    for (let j = 0; j < 2 * n; j++) aug[col]![j]! /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r]![col]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) aug[r]![j]! -= f * aug[col]![j]!;
    }
  }
  return aug.map((row) => row.slice(n));
};
