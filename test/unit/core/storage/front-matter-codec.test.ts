import { describe, expect, it } from '@jest/globals';
import { orderKeys, parseFrontMatter, stringifyFrontMatter } from '../../../../src/core/storage/front-matter-codec.ts';

/**
 * Deterministic pseudo-random generator (mulberry32).
 * @param seed - Seed.
 * @returns A function returning numbers in [0, 1).
 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scalars that are easy to coerce by mistake. */
const TRICKY = ['no', 'off', 'yes', '012', '1.10', '~', 'null', 'true', '', ' spaced ', 'a: b', '- item', '#hash', '---', 'é ü 日本'];

/**
 * Generates a random front-matter object.
 * @param next - Random source.
 * @param depth - Current depth.
 * @returns A JSON-compatible value.
 */
function generate(next: () => number, depth = 0): unknown {
  const pick = Math.floor(next() * (depth > 2 ? 4 : 6));
  if (pick === 0) return TRICKY[Math.floor(next() * TRICKY.length)];
  if (pick === 1) return Math.floor(next() * 1000) - 500;
  if (pick === 2) return next() > 0.5;
  if (pick === 3) return null;
  if (pick === 4) return Array.from({ length: Math.floor(next() * 3) }, () => generate(next, depth + 1));
  return Object.fromEntries(Array.from({ length: Math.floor(next() * 3) + 1 }, (_, i) => [`k${i}`, generate(next, depth + 1)]));
}

describe('front-matter codec', () => {
  it('[WL-05] round-trips 200 generated documents, body byte for byte', () => {
    const next = rng(42);
    for (let i = 0; i < 200; i += 1) {
      const data = { id: `01J${String(i).padStart(23, '0')}`, rev: i, extra: generate(next) };
      const body = `# Title ${i}\r\n\nline with --- inside\n${TRICKY.join('\n')}`;
      expect(parseFrontMatter(stringifyFrontMatter({ data, body }), 'x.md')).toEqual({ data, body });
    }
  });

  it('[WL-05] tolerates a BOM and CRLF delimiters and keeps the body untouched', () => {
    const doc = parseFrontMatter('﻿---\r\nid: x\r\n---\r\nbody\r\nline\r\n', 'x.md');
    expect(doc).toEqual({ data: { id: 'x' }, body: 'body\r\nline\r\n' });
  });

  it('[WL-05] accepts an empty body and a closing delimiter at end of file', () => {
    expect(parseFrontMatter('---\nid: x\n---', 'x.md')).toEqual({ data: { id: 'x' }, body: '' });
  });

  it('[WL-05] writes common keys first, the rest alphabetically, dropping undefined', () => {
    expect(Object.keys(orderKeys({ zeta: 1, machine: 'm', id: 'i', alpha: 2, rev: 1, type: 't', gone: undefined }))).toEqual([
      'id',
      'type',
      'rev',
      'machine',
      'alpha',
      'zeta',
    ]);
    expect(stringifyFrontMatter({ data: { title: 'T', id: 'X' }, body: 'b' })).toBe('---\nid: X\ntitle: T\n---\nb');
  });

  it('[WL-43] flags a merge-conflicted file as INVALID_FILE (merge_conflict)', () => {
    const text = '---\nid: x\n<<<<<<< HEAD\ntitle: a\n=======\ntitle: b\n>>>>>>> other\n---\n';
    expect(() => parseFrontMatter(text, 'tasks/x.md')).toThrow(
      expect.objectContaining({ code: 'INVALID_FILE', details: { reason: 'merge_conflict', file: 'tasks/x.md' } }),
    );
  });

  it.each([
    ['no opening delimiter', 'id: x\n'],
    ['unclosed block', '---\nid: x\n'],
    ['delimiter not alone on its line', '--- \nid: x\n---\n'],
    ['list instead of mapping', '---\n- a\n---\n'],
    ['empty front matter', '---\n---\nbody'],
  ])('[SEC-23] rejects %s as INVALID_FILE', (_label, text) => {
    expect(() => parseFrontMatter(text, 'x.md')).toThrow(expect.objectContaining({ code: 'INVALID_FILE' }));
  });

  it('[WL-28] rejects broken YAML in the front matter', () => {
    expect(() => parseFrontMatter('---\na: [1\n---\n', 'x.md')).toThrow(
      expect.objectContaining({ code: 'INVALID_FILE', details: expect.objectContaining({ reason: 'yaml' }) }),
    );
  });
});
