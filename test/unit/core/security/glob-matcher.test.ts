import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { GlobMatcher, MAX_GLOB_LENGTH } from '../../../../src/core/security/glob-matcher.ts';
import { ADVERSARIAL_BUDGET_MS, ADVERSARIAL_LENGTH, elapsedMs } from '../../../support/timing.ts';

/** Equivalence cases (fixture protected by CHECKSUMS). */
const CASES = JSON.parse(readFileSync('test/fixtures/security/glob-cases.json', 'utf8')) as Array<{
  pattern: string;
  path: string;
  match: boolean;
}>;

describe('GlobMatcher', () => {
  it.each(CASES.map((c) => [c.pattern, c.path, c.match] as const))('[WL-48] %p vs %p → %p', (pattern, path, match) => {
    expect(new GlobMatcher().matches(pattern, path)).toBe(match);
  });

  it(`[SEC-23] rejects patterns longer than ${MAX_GLOB_LENGTH} characters`, () => {
    expect(() => new GlobMatcher().matches('a'.repeat(MAX_GLOB_LENGTH + 1), 'a')).toThrow(
      expect.objectContaining({ code: 'VALIDATION' }),
    );
  });

  it.each([
    ['many stars vs runs of a', '*a'.repeat(MAX_GLOB_LENGTH / 2), 'a'.repeat(ADVERSARIAL_LENGTH) + 'b'],
    ['globstars vs deep path', '**/'.repeat(MAX_GLOB_LENGTH / 3), 'a/'.repeat(ADVERSARIAL_LENGTH / 2)],
    ['question marks', '?'.repeat(MAX_GLOB_LENGTH), 'x'.repeat(ADVERSARIAL_LENGTH)],
  ])(`[SEC-22][SEC-21][WL-48] matches pathological input (%s) under ${ADVERSARIAL_BUDGET_MS} ms`, (_label, pattern, path) => {
    expect(elapsedMs(() => new GlobMatcher().matches(pattern, path))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });
});
