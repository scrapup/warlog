import { describe, expect, it } from '@jest/globals';
import type { IndexedEntity } from '../../../../src/core/ports/store-view.port.ts';
import { DUPLICATE_OVERLAP, MAX_DUPLICATE_PAIRS, likelyDuplicates } from '../../../../src/domain/memory/review-candidates.ts';
import { tokenSet, wordTokens } from '../../../../src/domain/memory/token-matcher.ts';

/**
 * A memory in play with a title.
 * @param id - Id.
 * @param title - Title.
 * @param kind - Kind.
 * @returns The memory.
 */
function memory(id: string, title: string, kind = 'lesson'): IndexedEntity {
  return { id, type: 'memory', scope: 'repo', record: { data: { kind, status: 'active', title }, body: '' } } as unknown as IndexedEntity;
}

/**
 * Reference implementation: every pair, compared in full.
 * @param memories - Memories.
 * @returns `a|b` keys of the pairs at or above the threshold.
 */
function bruteForce(memories: readonly IndexedEntity[]): string[] {
  const out: string[] = [];
  memories.forEach((a, i) => {
    memories.slice(i + 1).forEach((b) => {
      const x = tokenSet(String(a.record.data['title']));
      const y = tokenSet(String(b.record.data['title']));
      const common = [...x].filter((w) => y.has(w)).length;
      const same = a.record.data['kind'] === b.record.data['kind'];
      if (same && x.size > 0 && y.size > 0 && common / Math.max(x.size, y.size) >= DUPLICATE_OVERLAP) {
        out.push([a.id, b.id].sort().join('|'));
      }
    });
  });
  return out.sort();
}

describe('likelyDuplicates', () => {
  it('[WL-17] reports titles sharing at least 80 % of their words, not less, and only within a kind', () => {
    const pairs = likelyDuplicates([
      memory('a', 'one two three four five'),
      memory('b', 'one two three four six'),
      memory('c', 'one two three four five six seven'),
      memory('d', 'one two three four five', 'guardrail'),
    ]);
    expect(pairs.map((p) => [p.a.id, p.b.id, p.overlap])).toEqual([['a', 'b', 0.8]]);
  });

  it('[WL-17] finds the same pairs as comparing every pair, on titles built from a small vocabulary', () => {
    const vocabulary = ['fix', 'windows', 'path', 'git', 'test', 'build', 'lint', 'node', 'cache', 'lock'];
    let seed = 7;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2_147_483_648;
      return seed % n;
    };
    const memories = Array.from({ length: 22 }, (_, i) => memory(`m${String(i).padStart(2, '0')}`, Array.from({ length: 3 + next(5) }, () => vocabulary[next(vocabulary.length)]).join(' ')));
    const expected = bruteForce(memories);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThanOrEqual(MAX_DUPLICATE_PAIRS);
    expect(likelyDuplicates(memories).map((p) => [p.a.id, p.b.id].sort().join('|')).sort()).toEqual(expected);
  });

  it('[WL-48] stays fast when thousands of titles share common words (the review runs in the MCP event loop)', () => {
    const memories = Array.from({ length: 4_000 }, (_, i) => memory(`id${i}`, `fix windows path ${i}`));
    const started = Date.now();
    const pairs = likelyDuplicates(memories);
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(pairs).toEqual([]);
  });

  it('[WL-48] is bounded even when every title is the same, and reports the most similar pairs first', () => {
    const memories = Array.from({ length: 1_000 }, (_, i) => memory(`id${String(i).padStart(4, '0')}`, 'same title'));
    const started = Date.now();
    const pairs = likelyDuplicates(memories);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(pairs).toHaveLength(MAX_DUPLICATE_PAIRS);
    expect(pairs.every((p) => p.overlap === 1)).toBe(true);
  });
});

describe('word tokens of scripts written without spaces', () => {
  it('[WL-16] makes every Han, kana and Hangul character a token, so a Japanese memory can be recalled', () => {
    expect(wordTokens('日本語のメモ')).toEqual(['日', '本', '語', 'の', 'メ', 'モ']);
    expect(wordTokens('fix 記憶 path')).toEqual(['fix', '記', '憶', 'path']);
    expect([...tokenSet('日本語の記憶')].every((t) => tokenSet('日本語の記憶のメモ').has(t))).toBe(true);
  });

  it('[WL-16] keeps Latin words whole and still separates punctuation, including full-width punctuation', () => {
    expect(wordTokens('Café_au-lait, 12!')).toEqual(['café_au', 'lait', '12']);
    expect(wordTokens('概要、設計。ok')).toEqual(['概', '要', '設', '計', 'ok']);
  });
});
