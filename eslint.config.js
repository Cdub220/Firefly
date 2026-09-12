// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Architectural boundaries, enforced by lint (and asserted by src/arch.test.ts).
 *
 *  - src/brain      may NOT import src/world, src/corruption, src/eval, src/ui, src/loop.
 *                   The brain sees only Observation objects. Never ground truth, never the
 *                   corruption pattern.
 *  - src/corruption may NOT import src/world or src/brain.
 *  - src/world      may NOT import src/brain or src/corruption.
 *  - src/shared     may NOT import anything outside src/shared.
 *
 * src/loop.ts is the only place world + corruption + brain meet.
 */
const forbid = (from, targets) => ({
  files: [`src/${from}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: targets.map((t) => ({
          group: [`**/${t}`, `**/${t}/**`, `@/${t}`, `@/${t}/**`],
          message: `src/${from} must not import from src/${t}. See eslint.config.js.`,
        })),
      },
    ],
  },
});

export const boundaries = {
  brain: ['world', 'corruption', 'eval', 'ui', 'loop'],
  corruption: ['world', 'brain', 'ui', 'loop'],
  world: ['brain', 'corruption', 'ui', 'loop'],
  shared: ['world', 'brain', 'corruption', 'eval', 'ui', 'loop'],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Determinism: every random draw goes through makeRng(seed).
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use makeRng(seed) from src/shared/rng.ts. Math.random breaks determinism.',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...Object.entries(boundaries).map(([from, targets]) => forbid(from, targets)),
);
