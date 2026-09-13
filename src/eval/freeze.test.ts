/**
 * The method freeze (CP3 prompt 3): once docs/06-freeze.md records the freeze commit, the
 * frozen estimator and corruption files must not differ from it. Skipped before the freeze.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const FROZEN_PATHS = [
  'src/brain/index.ts',
  'src/brain/consistency.ts',
  'src/brain/hypotheses.ts',
  'src/brain/physics.ts',
  'src/corruption/',
];

/** The 40-hex freeze hash recorded in docs/06-freeze.md, or null before the freeze. */
export function freezeHash(text: string): string | null {
  const m = /Freeze commit:\*{0,2}\s*`?([0-9a-f]{40})`?/.exec(text);
  return m ? m[1]! : null;
}

const FREEZE_DOC = 'docs/06-freeze.md';

describe('method freeze', () => {
  const exists = existsSync(FREEZE_DOC);
  it.skipIf(!exists)('docs/06-freeze.md records a full commit hash that exists in this repository', () => {
    const hash = freezeHash(readFileSync(FREEZE_DOC, 'utf8'));
    expect(hash).not.toBeNull();
    const type = execFileSync('git', ['cat-file', '-t', hash!], { encoding: 'utf8' }).trim();
    expect(type).toBe('commit');
  });

  it.skipIf(!exists)('the frozen files have not changed since the freeze commit, committed or not', () => {
    const hash = freezeHash(readFileSync(FREEZE_DOC, 'utf8'))!;
    // Working tree against the freeze commit (no HEAD argument), so an uncommitted edit to a
    // frozen file fails the suite too: the stop gate runs on the uncommitted tree.
    const out = execFileSync('git', ['diff', hash, '--stat', '--', ...FROZEN_PATHS], { encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });

  it('parses the hash line and nothing else', () => {
    expect(freezeHash('Freeze commit: `0123456789abcdef0123456789abcdef01234567`')).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(freezeHash('Freeze commit: 0123456789abcdef0123456789abcdef01234567 (Sun midnight)')).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(freezeHash('**Freeze commit:** `0123456789abcdef0123456789abcdef01234567` (dean-branch)')).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(freezeHash('Freeze commit: _not yet_')).toBeNull();
    expect(freezeHash('Freeze commit: `0123456789abcdef`')).toBeNull();
    expect(freezeHash('')).toBeNull();
  });
});
