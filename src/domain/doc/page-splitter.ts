/**
 * Pages of a large document (WL-66): documents above 500 KB are served in pages of consecutive
 * whole sections up to 100 KB; a section that alone exceeds a page is split at paragraph
 * boundaries (then at line boundaries, then at character boundaries).
 */
import type { TocEntry } from './section-index.ts';

/** Largest document served whole. */
export const WHOLE_DOCUMENT_BYTES = 500 * 1024;

/** Largest page. */
export const PAGE_BYTES = 100 * 1024;

/** A page: a byte range of the document. */
export interface Page {
  /** Page number, from 1. */
  readonly number: number;
  /** Byte offset of the first byte. */
  readonly byte_start: number;
  /** Byte offset after the last byte (exclusive). */
  readonly byte_end: number;
}

/**
 * Moves an offset back so it does not fall inside a multi-byte UTF-8 character.
 * @param bytes - Document bytes.
 * @param at - Offset.
 * @returns A character boundary at or before `at`.
 */
function boundary(bytes: Buffer, at: number): number {
  let i = at;
  while (i > 0 && i < bytes.length && ((bytes[i] ?? 0) & 0xc0) === 0x80) {
    i -= 1;
  }
  return i;
}

/**
 * Where to cut a unit larger than a page: after the last blank line, else after the last line
 * break, else at a character boundary, within the page size.
 * @param bytes - Document bytes.
 * @param start - Start of the unit.
 * @param end - End of the unit.
 * @returns The cut offset (greater than `start`).
 */
function cutPoint(bytes: Buffer, start: number, end: number): number {
  const limit = Math.min(start + PAGE_BYTES, end);
  const window = bytes.subarray(start, limit);
  const blank = window.lastIndexOf('\n\n');
  const line = window.lastIndexOf('\n');
  const cut = blank > 0 ? start + blank + 2 : line > 0 ? start + line + 1 : boundary(bytes, limit);
  return cut > start ? cut : limit;
}

/**
 * Splits a byte range into units no larger than a page.
 * @param bytes - Document bytes.
 * @param start - Range start.
 * @param end - Range end.
 * @returns Consecutive ranges covering `[start, end)`.
 */
function splitUnit(bytes: Buffer, start: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  let at = start;
  while (end - at > PAGE_BYTES) {
    const cut = cutPoint(bytes, at, end);
    out.push([at, cut]);
    at = cut;
  }
  out.push([at, end]);
  return out;
}

/**
 * Splits a range of a document into pages.
 * @param bytes - Document bytes.
 * @param toc - Section index (heading starts are the preferred boundaries).
 * @param from - Range start (0 for the whole document).
 * @param to - Range end (`bytes.length` for the whole document).
 * @returns The pages, numbered from 1.
 */
export function splitPages(bytes: Buffer, toc: readonly TocEntry[], from = 0, to = bytes.length): Page[] {
  const cuts = [...new Set([from, ...toc.map((t) => t.byte_start).filter((b) => b > from && b < to), to])].sort((a, b) => a - b);
  const units = cuts.slice(0, -1).flatMap((c, i) => splitUnit(bytes, c, cuts[i + 1] ?? to));
  const pages: Page[] = [];
  for (const [start, end] of units) {
    const last = pages[pages.length - 1];
    if (last !== undefined && end - last.byte_start <= PAGE_BYTES) {
      pages[pages.length - 1] = { ...last, byte_end: end };
    } else {
      pages.push({ number: pages.length + 1, byte_start: start, byte_end: end });
    }
  }
  return pages;
}
