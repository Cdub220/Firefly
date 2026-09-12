/**
 * Architectural rule: the brain cannot import the world (or corruption).
 * Asserts (1) the lint config declares the boundaries and (2) ESLint actually fails a
 * file in src/brain that imports src/world.
 */
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
// eslint.config.js is plain JS; the boundaries object is exported for this test.
// @ts-expect-error no types for the config module
import { boundaries } from '../eslint.config.js';

describe('architecture boundaries', () => {
  it('declares that brain cannot import world, corruption, or eval', () => {
    expect(boundaries.brain).toEqual(expect.arrayContaining(['world', 'corruption', 'eval']));
    expect(boundaries.corruption).toEqual(expect.arrayContaining(['world', 'brain']));
    expect(boundaries.world).toEqual(expect.arrayContaining(['brain', 'corruption']));
  });

  it('eslint rejects a brain file that imports from world', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const bad = `import { createWorld } from '../world';\nexport const x = createWorld;\n`;
    const [res] = await eslint.lintText(bad, { filePath: 'src/brain/_violation.ts' });
    const msgs = res?.messages.filter((m) => m.ruleId === 'no-restricted-imports') ?? [];
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('eslint rejects a brain file that imports from corruption', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const bad = `import { createCorruptor } from '../corruption';\nexport const x = createCorruptor;\n`;
    const [res] = await eslint.lintText(bad, { filePath: 'src/brain/_violation.ts' });
    const msgs = res?.messages.filter((m) => m.ruleId === 'no-restricted-imports') ?? [];
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('eslint allows brain to import shared', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const ok = `import { makeRng } from '../shared/rng';\nexport const x = makeRng;\n`;
    const [res] = await eslint.lintText(ok, { filePath: 'src/brain/_ok.ts' });
    const msgs = res?.messages.filter((m) => m.ruleId === 'no-restricted-imports') ?? [];
    expect(msgs).toHaveLength(0);
  });

  it('eslint bans Math.random in src', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const bad = `export const x = Math.random();\n`;
    const [res] = await eslint.lintText(bad, { filePath: 'src/world/_rand.ts' });
    const msgs = res?.messages.filter((m) => m.ruleId === 'no-restricted-properties') ?? [];
    expect(msgs.length).toBeGreaterThan(0);
  });
});
