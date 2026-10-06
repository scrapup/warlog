/**
 * The section index of a document (plan §3.8, WL-66): the heading tree with GitHub-style anchors
 * and the byte range of every section (heading line up to the next heading of the same or a
 * higher level, so a section includes its subsections).
 */
import type { Heading } from './markdown-scanner.ts';

/** One entry of the section index. */
export interface TocEntry {
  /** Heading level 1..6. */
  readonly level: number;
  /** Heading text. */
  readonly title: string;
  /** Unique anchor (`getting-started`, `getting-started-1`). */
  readonly anchor: string;
  /** Byte offset of the heading line. */
  readonly byte_start: number;
  /** Byte offset after the section (exclusive). */
  readonly byte_end: number;
  /** Size of the section in bytes. */
  readonly bytes: number;
}

/**
 * Tells whether a code point is punctuation or a symbol outside ASCII (dropped from anchors):
 * Latin-1 punctuation, general punctuation to dingbats, CJK and full-width punctuation, emoji.
 * @param cp - Code point.
 * @returns `true` when dropped.
 */
function isWidePunctuation(cp: number): boolean {
  const dropped: readonly (readonly [number, number])[] = [[0x80, 0xa9], [0xab, 0xb4], [0xb6, 0xb9], [0xbb, 0xbf], [0x2000, 0x2bff], [0x3000, 0x303f], [0xfe30, 0xfe6f], [0xff00, 0xff0f], [0xff1a, 0xff20], [0xff3b, 0xff40], [0xff5b, 0xff65], [0x1f000, 0x1faff]];
  return dropped.some(([from, to]) => cp >= from && cp <= to);
}

/**
 * Tells whether a character is kept in an anchor: letters and digits of any script, `_` and `-`.
 * @param ch - One character.
 * @returns `true` when kept.
 */
function isAnchorChar(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80) {
    return ch === '_' || ch === '-' || ch.toLowerCase() !== ch.toUpperCase() || (ch >= '0' && ch <= '9');
  }
  return !isWidePunctuation(cp);
}

/**
 * Anchor of a heading text: lower-case, letters and digits kept, spaces become `-`, the rest is dropped.
 * @param title - Heading text.
 * @returns The base anchor (may be empty).
 */
export function anchorOf(title: string): string {
  return [...title.toLowerCase()]
    .map((c) => (c === ' ' ? '-' : isAnchorChar(c) ? c : ''))
    .join('');
}

/**
 * Byte offsets of character offsets, computed in one pass over the sorted offsets.
 * @param text - Text.
 * @param offsets - Character offsets (any order, may repeat).
 * @returns A map from character offset to byte offset.
 */
function byteOffsets(text: string, offsets: readonly number[]): Map<number, number> {
  const sorted = [...new Set(offsets)].sort((a, b) => a - b);
  const map = new Map<number, number>();
  let char = 0;
  let bytes = 0;
  for (const offset of sorted) {
    bytes += Buffer.byteLength(text.slice(char, offset));
    char = offset;
    map.set(offset, bytes);
  }
  return map;
}

/**
 * Builds the section index.
 * @param text - Markdown.
 * @param headings - Headings found by the scanner.
 * @returns One entry per heading, in document order.
 */
export function buildToc(text: string, headings: readonly Heading[]): TocEntry[] {
  const ends = headings.map((h, i) => headings.slice(i + 1).find((n) => n.level <= h.level)?.start ?? text.length);
  const bytes = byteOffsets(text, [...headings.map((h) => h.start), ...ends]);
  const used = new Map<string, number>();
  return headings.map((h, i) => {
    const base = anchorOf(h.title);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const start = bytes.get(h.start) ?? 0;
    const end = bytes.get(ends[i] ?? text.length) ?? start;
    return { level: h.level, title: h.title, anchor: seen === 0 ? base : `${base}-${seen}`, byte_start: start, byte_end: end, bytes: end - start };
  });
}
