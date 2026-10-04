import { describe, expect, it } from '@jest/globals';
import { normalizeRemote } from '../../../../src/core/git/remote-normalizer.ts';
import { ADVERSARIAL_BUDGET_MS, ADVERSARIAL_LENGTH, elapsedMs } from '../../../support/timing.ts';

describe('normalizeRemote', () => {
  it.each([
    ['git@github.com:scrapup/warlog.git', 'github.com__scrapup__warlog'],
    ['https://github.com/scrapup/warlog.git', 'github.com__scrapup__warlog'],
    ['https://user:token@GitHub.COM/scrapup/warlog/', 'github.com__scrapup__warlog'],
    ['ssh://git@github.com:22/scrapup/warlog.git', 'github.com__scrapup__warlog'],
    ['ssh://git@gitlab.example.org/group/sub/project', 'gitlab.example.org__group__sub__project'],
    ['file:///Users/me/repos/x.git', 'Users__me__repos__x'],
    ['git@host:../../escape', 'host__escape'],
    ['https://host/a b/c~d', 'host__a-b__c-d'],
  ])('[WL-02] %p → %p', (url, key) => {
    expect(normalizeRemote(url)).toBe(key);
  });

  it(`[SEC-22][WL-48] normalizes a ${ADVERSARIAL_LENGTH}-character remote under ${ADVERSARIAL_BUDGET_MS} ms`, () => {
    const url = `https://${'@'.repeat(ADVERSARIAL_LENGTH / 2)}host/${'a/'.repeat(ADVERSARIAL_LENGTH / 4)}.git`;
    expect(elapsedMs(() => normalizeRemote(url))).toBeLessThan(ADVERSARIAL_BUDGET_MS);
  });
});
