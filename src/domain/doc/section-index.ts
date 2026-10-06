/**
 * The section index of a document (plan §3.8, WL-66): the heading tree with GitHub-style anchors
 * and the byte range of every section (heading line up to the next heading of the same or a
 * higher level, so a section includes its subsections).
 */
import { isWidePunctuation } from '../../core/security/char-classes.ts';
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
 * Where each section ends: at the next heading of the same or a higher level, else at the end of
 * the text. One pass with a stack of the sections still open, so the cost is linear in the number
 * of headings (a document may hold hundreds of thousands).
 * @param length - Length of the text.
 * @param headings - Headings in document order.
 * @returns One end offset (character index) per heading.
 */
function sectionEnds(length: number, headings: readonly Heading[]): number[] {
  const ends = headings.map(() => length);
  const open: number[] = [];
  headings.forEach((h, i) => {
    while (open.length > 0 && (headings[open[open.length - 1] ?? 0]?.level ?? 0) >= h.level) {
      ends[open.pop() ?? 0] = h.start;
    }
    open.push(i);
  });
  return ends;
}

/**
 * Builds the section index.
 * @param text - Markdown.
 * @param headings - Headings found by the scanner.
 * @returns One entry per heading, in document order.
 */
export function buildToc(text: string, headings: readonly Heading[]): TocEntry[] {
  const ends = sectionEnds(text.length, headings);
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
