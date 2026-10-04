import { describe, expect, it } from '@jest/globals';
import { assertValid, isRepoKey, isSlug, isUlid, isVarName } from '../../../../src/core/security/identifiers.ts';

describe('identifier validators', () => {
  it.each(['01J0000000000000000000000A', '7ZZZZZZZZZZZZZZZZZZZZZZZZZ'])('[WL-49] accepts ULID %p', (id) => {
    expect(isUlid(id)).toBe(true);
  });

  it.each(['', '01J000000000000000000000', '01J0000000000000000000000a', '01J000000000000000000000IL', '8ZZZZZZZZZZZZZZZZZZZZZZZZZ', '../../etc/passwd/xxxxxxxxx'])(
    '[WL-49] rejects ULID %p',
    (id) => {
      expect(isUlid(id)).toBe(false);
    },
  );

  it.each(['forge.parallel_executors', 'a', 'docs.import.allowed-roots', 'x'.repeat(128)])('[WL-49] accepts var name %p', (name) => {
    expect(isVarName(name)).toBe(true);
  });

  it.each(['', 'a..b', '.hidden', 'trailing.', 'UPPER', 'with space', '../x', 'a/b', 'a\\b', 'x'.repeat(129)])(
    '[WL-49] rejects var name %p',
    (name) => {
      expect(isVarName(name)).toBe(false);
    },
  );

  it.each([
    ['warlog', true],
    ['initial-spec', true],
    ['-leading', false],
    ['Upper', false],
    ['a_b', false],
    ['', false],
    ['x'.repeat(81), false],
  ])('[WL-49] slug %p → %p', (slug, ok) => {
    expect(isSlug(slug)).toBe(ok);
  });

  it.each([
    ['github.com__scrapup__warlog', true],
    ['local__MyRepo', true],
    ['a..b', false],
    ['.git', false],
    ['a/b', false],
    ['', false],
  ])('[WL-49] repo key %p → %p', (key, ok) => {
    expect(isRepoKey(key)).toBe(ok);
  });

  it('raises VALIDATION naming the field', () => {
    expect(() => assertValid(false, 'name', 'a variable name')).toThrow(
      expect.objectContaining({ code: 'VALIDATION', message: 'name must be a variable name', details: { field: 'name' } }),
    );
    expect(() => assertValid(true, 'name', 'x')).not.toThrow();
  });
});
