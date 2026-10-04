import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { classifyFileName } from '../../../../src/core/security/file-name-classifier.ts';
import { hasMergeConflictMarkers } from '../../../../src/core/security/merge-marker-detector.ts';
import { ADVERSARIAL_BUDGET_MS, ADVERSARIAL_LENGTH, medianElapsedMs } from '../../../support/timing.ts';

const DIR = 'test/fixtures/security';

/** File-name cases (fixture protected by CHECKSUMS). */
const NAMES = JSON.parse(readFileSync(`${DIR}/file-names.json`, 'utf8')) as Array<{ name: string; class: string }>;

describe('classifyFileName', () => {
  it.each(NAMES.map((c) => [c.name, c.class] as const))('[WL-43] %p is %p', (name, expected) => {
    expect(classifyFileName(name)).toBe(expected);
  });

  it(`[SEC-22][WL-48] classifies a ${ADVERSARIAL_LENGTH}-character name under ${ADVERSARIAL_BUDGET_MS} ms`, () => {
    const name = `${' 1'.repeat(ADVERSARIAL_LENGTH / 2)}.md`;
    expect(medianElapsedMs(() => classifyFileName(name))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });
});

describe('hasMergeConflictMarkers', () => {
  it('[WL-43] detects a merge-conflicted file', () => {
    expect(hasMergeConflictMarkers(readFileSync(`${DIR}/merge-conflict.md`, 'utf8'))).toBe(true);
    expect(hasMergeConflictMarkers(readFileSync(`${DIR}/merge-conflict.md`, 'utf8').split('\n').join('\r\n'))).toBe(true);
  });

  it('[WL-43] ignores setext headings and lone markers', () => {
    expect(hasMergeConflictMarkers(readFileSync(`${DIR}/setext-heading.md`, 'utf8'))).toBe(false);
    expect(hasMergeConflictMarkers('=======\n>>>>>>> x\n')).toBe(false);
  });

  it(`[SEC-22][WL-48] scans ${ADVERSARIAL_LENGTH} marker-like lines under ${ADVERSARIAL_BUDGET_MS} ms`, () => {
    const text = '<<<<<<< x\n'.repeat(ADVERSARIAL_LENGTH / 10);
    expect(medianElapsedMs(() => hasMergeConflictMarkers(text))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });
});

describe('security fixtures', () => {
  it('[SEC-24] are unchanged: every fixture matches its recorded sha256 and is listed', () => {
    const recorded = new Map(
      readFileSync(`${DIR}/CHECKSUMS`, 'utf8')
        .trim()
        .split('\n')
        .map((line) => {
          const [hash = '', name = ''] = line.split(/\s+/);
          return [name, hash] as const;
        }),
    );
    const files = readdirSync(DIR).filter((f) => f !== 'CHECKSUMS').sort();
    expect([...recorded.keys()].sort()).toEqual(files);
    for (const file of files) {
      const actual = createHash('sha256').update(readFileSync(`${DIR}/${file}`)).digest('hex');
      expect([file, actual]).toEqual([file, recorded.get(file)]);
    }
  });
});
