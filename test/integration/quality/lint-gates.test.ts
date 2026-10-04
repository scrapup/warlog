import { describe, expect, it } from '@jest/globals';
import { ESLint } from 'eslint';

const FIXTURES = 'test/fixtures/lint';

/** One ESLint instance for every case (config and parser loaded once). */
const eslint = new ESLint({ ignore: false });

/**
 * Lints one fixture with the project configuration, ignores disabled.
 * @param file - Fixture path relative to the fixtures root.
 * @returns The messages reported.
 */
async function lint(file: string): Promise<ESLint.LintResult['messages']> {
  const [result] = await eslint.lintFiles([`${FIXTURES}/${file}`]);
  return result?.messages ?? [];
}

describe('lint gates (plan §7.1, §7.2)', () => {
  it.each([
    ['src/missing-jsdoc.ts', 'jsdoc/require-jsdoc'],
    ['scripts/missing-jsdoc.ts', 'jsdoc/require-jsdoc'],
    ['src/undocumented-member.ts', 'jsdoc/require-jsdoc'],
    ['src/undocumented-type.ts', 'jsdoc/require-jsdoc'],
    ['src/missing-description.ts', 'jsdoc/require-description'],
    ['src/missing-param.ts', 'jsdoc/require-param'],
    ['src/missing-param-description.ts', 'jsdoc/require-param-description'],
    ['src/missing-returns.ts', 'jsdoc/require-returns'],
    ['src/missing-returns-description.ts', 'jsdoc/require-returns-description'],
    ['src/wrong-param-name.ts', 'jsdoc/check-param-names'],
    ['src/undefined-type.ts', 'jsdoc/no-undefined-types'],
    ['src/explicit-any.ts', '@typescript-eslint/no-explicit-any'],
    ['src/two-classes.ts', 'max-classes-per-file'],
    ['src/complex.ts', 'complexity'],
    ['src/long-function.ts', 'max-lines-per-function'],
    ['src/long-file.ts', 'max-lines'],
    ['src/console.ts', 'no-console'],
    ['src/domain/imports-fs.ts', 'no-restricted-imports'],
    ['src/domain/imports-fs-promises.ts', 'no-restricted-imports'],
    ['src/domain/imports-child-process.ts', 'no-restricted-imports'],
    ['src/core/mediator/imports-adapter.ts', 'no-restricted-imports'],
    ['src/core/mediator/imports-adapters-barrel.ts', 'no-restricted-imports'],
  ])('%s triggers %s', async (file, rule) => {
    expect((await lint(file)).map((m) => m.ruleId)).toContain(rule);
  }, 30_000);

  it('ignores inline disable comments in source and still reports the violation', async () => {
    const messages = await lint('src/disable-comment.ts');
    expect(messages.map((m) => m.ruleId)).toContain('@typescript-eslint/no-explicit-any');
    expect(messages.map((m) => m.message)).toContainEqual(expect.stringMatching(/noInlineConfig/));
  }, 30_000);

  it('accepts a compliant file', async () => {
    expect(await lint('src/compliant.ts')).toEqual([]);
  }, 30_000);
});
