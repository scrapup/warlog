import { describe, expect, it } from '@jest/globals';
import { normalizeRemote } from '../../../src/core/git/remote-normalizer.ts';
import { classifyFileName } from '../../../src/core/security/file-name-classifier.ts';
import { GlobMatcher, MAX_GLOB_LENGTH } from '../../../src/core/security/glob-matcher.ts';
import { hasMergeConflictMarkers } from '../../../src/core/security/merge-marker-detector.ts';
import { SecretGuard } from '../../../src/core/security/secret-guard.ts';
import { ADVERSARIAL_BUDGET_MS, ADVERSARIAL_LENGTH, fastestElapsedMs } from '../../support/timing.ts';

// Absolute time budgets run here, without coverage instrumentation, so they measure the real
// cost of the matchers; the unit tests keep the relative (scaling) proofs.

describe('adversarial input budgets (SEC-22)', () => {
  it.each([
    ['many stars vs runs of a', '*a'.repeat(MAX_GLOB_LENGTH / 2), 'a'.repeat(ADVERSARIAL_LENGTH) + 'b'],
    ['globstars vs deep path', '**/'.repeat(MAX_GLOB_LENGTH / 3), 'a/'.repeat(ADVERSARIAL_LENGTH / 2)],
    ['question marks', '?'.repeat(MAX_GLOB_LENGTH), 'x'.repeat(ADVERSARIAL_LENGTH)],
  ])(`[SEC-22][SEC-21][WL-48] matches a pathological glob (%s) under ${ADVERSARIAL_BUDGET_MS} ms`, (_label, pattern, path) => {
    expect(fastestElapsedMs(() => new GlobMatcher().matches(pattern, path))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });

  it.each([
    ['runs of a', 'a'.repeat(ADVERSARIAL_LENGTH)],
    ['repeated partial prefixes', ['gh', 'p_'].join('').repeat(ADVERSARIAL_LENGTH / 4)],
    ['prefix plus 35 chars repeated', `${['gh', 'p_'].join('')}${'a'.repeat(35)} `.repeat(ADVERSARIAL_LENGTH / 40)],
    ['dashes after sk-', `${['s', 'k-'].join('')}${'-'.repeat(ADVERSARIAL_LENGTH)}`],
    ['repeated sk- prefixes', ['s', 'k-'].join('').repeat(ADVERSARIAL_LENGTH / 3)],
    ['underscores', '_'.repeat(ADVERSARIAL_LENGTH)],
    ['repeated BEGIN headers', '-----BEGIN '.repeat(ADVERSARIAL_LENGTH / 11)],
  ])(`[SEC-22][SEC-21][WL-48] scans pathological secret input (%s) under ${ADVERSARIAL_BUDGET_MS} ms`, (_label, text) => {
    expect(fastestElapsedMs(() => new SecretGuard().scan(text))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });

  it(`[SEC-22][WL-48] classifies a ${ADVERSARIAL_LENGTH}-character file name under ${ADVERSARIAL_BUDGET_MS} ms`, () => {
    const name = `${' 1'.repeat(ADVERSARIAL_LENGTH / 2)}.md`;
    expect(fastestElapsedMs(() => classifyFileName(name))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });

  it(`[SEC-22][WL-48] scans ${ADVERSARIAL_LENGTH} marker-like lines under ${ADVERSARIAL_BUDGET_MS} ms`, () => {
    const text = '<<<<<<< x\n'.repeat(ADVERSARIAL_LENGTH / 10);
    expect(fastestElapsedMs(() => hasMergeConflictMarkers(text))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });

  it(`[SEC-22][WL-48] normalizes a ${ADVERSARIAL_LENGTH}-character remote under ${ADVERSARIAL_BUDGET_MS} ms`, () => {
    const url = `https://${'@'.repeat(ADVERSARIAL_LENGTH / 2)}host/${'a/'.repeat(ADVERSARIAL_LENGTH / 4)}.git`;
    expect(fastestElapsedMs(() => normalizeRemote(url))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });
});
