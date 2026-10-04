import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { GlobMatcher, MAX_GLOB_LENGTH } from '../../../../src/core/security/glob-matcher.ts';
import { ADVERSARIAL_LENGTH, LINEAR_RATIO_LIMIT, scalingRatio } from '../../../support/timing.ts';

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
  ])('[WL-48] terminates on pathological input (%s); time budget in integration', (_label, pattern, path) => {
    expect(typeof new GlobMatcher().matches(pattern, path)).toBe('boolean');
  });

  it('[SEC-22][WL-48] scales linearly in the path length', () => {
    const pattern = '*a'.repeat(32);
    const ratio = scalingRatio((n) => 'a'.repeat(n) + 'b', (path) => new GlobMatcher().matches(pattern, path), ADVERSARIAL_LENGTH);
    expect(ratio).toBeLessThan(LINEAR_RATIO_LIMIT);
  });
});
