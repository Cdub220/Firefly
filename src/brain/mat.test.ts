import { describe, expect, it } from 'vitest';
import { add, identity, inverse, matmul, matvec, sub, transpose, zeros } from './mat';

describe('mat helpers', () => {
  it('identity and zeros have the right shape', () => {
    expect(identity(3)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(zeros(2, 3)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('matmul multiplies rectangular matrices', () => {
    const a = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const b = [
      [7, 8],
      [9, 10],
      [11, 12],
    ];
    expect(matmul(a, b)).toEqual([
      [58, 64],
      [139, 154],
    ]);
  });

  it('transpose, add, sub, matvec', () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    expect(transpose([[1, 2, 3]])).toEqual([[1], [2], [3]]);
    expect(add(a, a)).toEqual([
      [2, 4],
      [6, 8],
    ]);
    expect(sub(a, a)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(matvec(a, [1, 1])).toEqual([3, 7]);
  });

  it('inverse: A * A^-1 = I, including a matrix needing pivoting', () => {
    const a = [
      [0, 2, 1],
      [1, 1, 1],
      [2, 0, 3],
    ];
    const prod = matmul(a, inverse(a));
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(prod[i]![j]!).toBeCloseTo(i === j ? 1 : 0, 10);
      }
    }
  });

  it('inverse throws on a singular matrix', () => {
    expect(() =>
      inverse([
        [1, 2],
        [2, 4],
      ]),
    ).toThrow(/singular/);
  });
});
