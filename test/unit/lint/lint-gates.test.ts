import { describe, expect, it } from '@jest/globals';
import { ESLint } from 'eslint';

const FIXTURES = 'test/fixtures/lint/src';

/**
 * Lints one fixture with the project configuration, ignores disabled.
 * @param file - Fixture path relative to the fixtures root.
 * @returns Rule ids reported (fatal parse errors as `parse`).
 */
async function rulesFor(file: string): Promise<string[]> {
  const eslint = new ESLint({ ignore: false });
  const [result] = await eslint.lintFiles([`${FIXTURES}/${file}`]);
  return (result?.messages ?? []).map((m) => m.ruleId ?? (m.fatal === true ? 'parse' : 'inline-config'));
}

describe('lint gates (plan §7.1, §7.2)', () => {
  it.each([
    ['missing-jsdoc.ts', 'jsdoc/require-jsdoc'],
    ['missing-param.ts', 'jsdoc/require-param'],
    ['missing-returns.ts', 'jsdoc/require-returns'],
    ['explicit-any.ts', '@typescript-eslint/no-explicit-any'],
    ['two-classes.ts', 'max-classes-per-file'],
    ['complex.ts', 'complexity'],
    ['long-function.ts', 'max-lines-per-function'],
    ['long-file.ts', 'max-lines'],
    ['console.ts', 'no-console'],
    ['domain/imports-fs.ts', 'no-restricted-imports'],
    ['core/mediator/imports-adapter.ts', 'no-restricted-imports'],
  ])('%s triggers %s', async (file, rule) => {
    expect(await rulesFor(file)).toContain(rule);
  }, 30_000);

  it('ignores inline disable comments in source and still reports the violation', async () => {
    const rules = await rulesFor('disable-comment.ts');
    expect(rules).toContain('@typescript-eslint/no-explicit-any');
    expect(rules).toContain('inline-config');
  }, 30_000);

  it('accepts a compliant file', async () => {
    expect(await rulesFor('compliant.ts')).toEqual([]);
  }, 30_000);
});
