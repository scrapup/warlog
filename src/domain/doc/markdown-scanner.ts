/**
 * Linear Markdown scanners used by the document registry (WL-61, WL-62, WL-66, WL-48): ATX
 * headings and inline image links, skipping fenced code blocks and inline code spans. No regular
 * expressions: one pass over the text, a bounded amount of work per character.
 */
import { bracketPairs, codeMask, indexWithin, runLength } from './inline-scan.ts';


/** An ATX heading. */
export interface Heading {
  /** Level 1..6. */
  readonly level: number;
  /** Heading text (closing `#`s removed, trimmed). */
  readonly title: string;
  /** Offset of the start of the heading line (UTF-16 index). */
  readonly start: number;
}

/** An inline image link `![alt](dest "title")`. */
export interface ImageLink {
  /** Alternative text. */
  readonly alt: string;
  /** Offset of the first character of the destination (UTF-16 index). */
  readonly destStart: number;
  /** Offset after the last character of the destination. */
  readonly destEnd: number;
  /** The destination as written (without angle brackets). */
  readonly dest: string;
  /** 1-based line number. */
  readonly line: number;
}

/** What a scan found. */
export interface MarkdownScan {
  /** Headings in document order. */
  readonly headings: Heading[];
  /** Inline images in document order. */
  readonly images: ImageLink[];
  /** Inline HTML `<img` tags outside code (not validated or rewritten). */
  readonly htmlImages: number;
  /** Lines (1-based) whose image links were not scanned because the line is pathologically complex. */
  readonly unscannedLines: number[];
}

/** Longest alt text or destination looked at, bounding the work per link. */
const MAX_LINK_PART = 4_096;

/** Work, per character of a line, its image links may cost before the rest of the line is left unscanned. */
const LINE_WORK_PER_CHAR = 16;

/** Work allowed on any line besides {@link LINE_WORK_PER_CHAR}. */
const LINE_WORK_BASE = 16 * MAX_LINK_PART;

/** An open fenced code block. */
interface Fence {
  /** Fence character (`` ` `` or `~`). */
  readonly char: string;
  /** Length of the opening fence. */
  readonly length: number;
}

/**
 * Index of the first non-space character (at most three leading spaces allowed for structure).
 * @param line - Line.
 * @returns The indent in spaces, or `-1` when indented four or more spaces (code block).
 */
function indentOf(line: string): number {
  let n = 0;
  while (line.charAt(n) === ' ') {
    n += 1;
  }
  return n > 3 ? -1 : n;
}

/**
 * Fence opened by a line.
 * @param line - Line.
 * @returns The fence, or `undefined`.
 */
function openFence(line: string): Fence | undefined {
  const at = indentOf(line);
  const char = at < 0 ? '' : line.charAt(at);
  if (char !== '`' && char !== '~') {
    return undefined;
  }
  const length = runLength(line, at, char);
  return length >= 3 && !(char === '`' && line.indexOf('`', at + length) >= 0) ? { char, length } : undefined;
}

/**
 * Tells whether a line closes a fence.
 * @param line - Line.
 * @param fence - Open fence.
 * @returns `true` when it closes it.
 */
function closesFence(line: string, fence: Fence): boolean {
  const at = indentOf(line);
  return at >= 0 && line.charAt(at) === fence.char && runLength(line, at, fence.char) >= fence.length && line.slice(at + runLength(line, at, fence.char)).trim() === '';
}

/**
 * ATX heading of a line.
 * @param line - Line without its line break.
 * @param start - Offset of the line in the text.
 * @returns The heading, or `undefined`.
 */
function headingOf(line: string, start: number): Heading | undefined {
  const at = indentOf(line);
  if (at < 0 || line.charAt(at) !== '#') {
    return undefined;
  }
  const level = runLength(line, at, '#');
  const after = line.charAt(at + level);
  if (level > 6 || (after !== '' && after !== ' ' && after !== '\t')) {
    return undefined;
  }
  return { level, title: withoutClosing(line.slice(at + level).trim()), start };
}

/**
 * Removes the optional closing `#` run of a heading (only when preceded by a space).
 * @param title - Trimmed heading text.
 * @returns The text without the closing run.
 */
function withoutClosing(title: string): string {
  let closing = 0;
  while (closing < title.length && title.charAt(title.length - 1 - closing) === '#') {
    closing += 1;
  }
  const spaced = closing > 0 && (closing === title.length || title.charAt(title.length - closing - 1) === ' ');
  return spaced ? title.slice(0, title.length - closing).trim() : title;
}

/** Destination and title of a link after `](`. */
interface Destination {
  /** Start of the destination text. */
  readonly start: number;
  /** End of the destination text. */
  readonly end: number;
  /** Index after the closing `)`. */
  readonly next: number;
}

/**
 * End of an angle-bracket destination `<...>`.
 * @param line - Line.
 * @param open - Index of `<`.
 * @returns The destination bounds, or `undefined`.
 */
function angleDestination(line: string, open: number): Destination | undefined {
  const close = indexWithin(line, '>', open + 1, MAX_LINK_PART);
  return close < 0 || indexWithin(line, '<', open + 1, close - open - 1) >= 0 ? undefined : { start: open + 1, end: close, next: close + 1 };
}

/**
 * End of a plain destination: no spaces, balanced parentheses.
 * @param line - Line.
 * @param from - Index of its first character.
 * @returns The destination bounds, or `undefined`.
 */
function plainDestination(line: string, from: number): Destination | undefined {
  let depth = 0;
  let i = from;
  while (i < line.length && i - from <= MAX_LINK_PART) {
    const ch = line.charAt(i);
    const next = ch === '\\' ? depth : parenDepth(ch, depth);
    if (next < 0) {
      break;
    }
    depth = next;
    i += ch === '\\' ? 2 : 1;
  }
  return depth === 0 && i > from ? { start: from, end: i, next: i } : undefined;
}

/**
 * Parenthesis depth after a character of a plain destination.
 * @param ch - The character.
 * @param depth - Depth before it.
 * @returns The new depth, or `-1` when the destination ends at this character.
 */
function parenDepth(ch: string, depth: number): number {
  if (ch === ' ' || ch === '\t' || (ch === ')' && depth === 0)) {
    return -1;
  }
  return ch === '(' ? depth + 1 : ch === ')' ? depth - 1 : depth;
}

/**
 * Skips spaces and tabs.
 * @param line - Line.
 * @param from - Start index.
 * @returns The index of the first other character.
 */
function skipBlanks(line: string, from: number): number {
  let i = from;
  while (line.charAt(i) === ' ' || line.charAt(i) === '\t') {
    i += 1;
  }
  return i;
}

/**
 * Skips an optional title and the closing parenthesis.
 * @param line - Line.
 * @param from - Index after the destination.
 * @returns The index after `)`, or `-1` when the link is not closed.
 */
function closeLink(line: string, from: number): number {
  let i = skipBlanks(line, from);
  const quote = line.charAt(i);
  if (quote === '"' || quote === "'" || quote === '(') {
    const end = indexWithin(line, quote === '(' ? ')' : quote, i + 1, MAX_LINK_PART);
    if (end < 0) {
      return -1;
    }
    i = skipBlanks(line, end + 1);
  }
  return line.charAt(i) === ')' ? i + 1 : -1;
}

/** Images of one line, and whether scanning stopped because the line is too complex. */
interface LineImages {
  /** Images found. */
  readonly found: ImageLink[];
  /** `true` when the work allowance of the line ran out. */
  readonly exhausted: boolean;
}

/**
 * Inline images of one line. The work spent on a line is bounded (a few passes over it): once it
 * is used up the rest of the line is reported as unscanned instead of costing quadratic time.
 * @param line - Line without its break.
 * @param start - Offset of the line in the text.
 * @param lineNo - 1-based line number.
 * @returns The images found outside inline code.
 */
function imagesOf(line: string, start: number, lineNo: number): LineImages {
  const found: ImageLink[] = [];
  let at = line.indexOf('![');
  if (at < 0) {
    return { found, exhausted: false };
  }
  const mask = codeMask(line);
  const pairs = bracketPairs(line);
  let allowance = LINE_WORK_PER_CHAR * line.length + LINE_WORK_BASE;
  while (at >= 0) {
    const next = tryImage(line, at, mask, pairs);
    allowance -= next === undefined ? Math.min(line.length - at, 3 * MAX_LINK_PART) : next.dest.next - at;
    if (allowance < 0) {
      return { found, exhausted: true };
    }
    if (next !== undefined) {
      found.push({ alt: line.slice(at + 2, next.altEnd), destStart: start + next.dest.start, destEnd: start + next.dest.end, dest: line.slice(next.dest.start, next.dest.end), line: lineNo });
    }
    at = line.indexOf('![', next === undefined ? at + 2 : next.dest.next);
  }
  return { found, exhausted: false };
}

/** A parsed image link. */
interface ParsedImage {
  /** Index of the `]` closing the alt text. */
  readonly altEnd: number;
  /** The destination. */
  readonly dest: Destination;
}

/**
 * Index of the `]` closing the alt text of an image, when `(` follows it and the alt text is of
 * a reasonable length.
 * @param line - Line.
 * @param at - Index of `!`.
 * @param pairs - Bracket pairs of the line.
 * @returns The index, or `-1`.
 */
function altTextEnd(line: string, at: number, pairs: ReadonlyMap<number, number>): number {
  const end = pairs.get(at + 1) ?? -1;
  return end < 0 || end - at - 2 > MAX_LINK_PART || line.charAt(end + 1) !== '(' ? -1 : end;
}

/**
 * Parses the image link starting at `![`.
 * @param line - Line.
 * @param at - Index of `!`.
 * @param mask - Inline code mask of the line.
 * @param pairs - Bracket pairs of the line.
 * @returns The parsed image, or `undefined` when it is not a valid inline image.
 */
function tryImage(line: string, at: number, mask: readonly boolean[], pairs: ReadonlyMap<number, number>): ParsedImage | undefined {
  const altEnd = mask[at] === true || line.charAt(at - 1) === '\\' ? -1 : altTextEnd(line, at, pairs);
  if (altEnd < 0) {
    return undefined;
  }
  const i = skipBlanks(line, altEnd + 2);
  const dest = line.charAt(i) === '<' ? angleDestination(line, i) : plainDestination(line, i);
  const closed = dest === undefined ? -1 : closeLink(line, dest.next);
  return dest === undefined || closed < 0 ? undefined : { altEnd, dest: { ...dest, next: closed } };
}

/** A scan being built. */
interface ScanUnderway {
  /** Headings so far. */
  readonly headings: Heading[];
  /** Images so far. */
  readonly images: ImageLink[];
  /** Unscanned lines so far. */
  readonly unscannedLines: number[];
  /** HTML images so far. */
  htmlImages: number;
}

/**
 * Adds what one line outside a fenced block holds: its heading, images and HTML images.
 * @param scan - The scan being built (updated).
 * @param line - Line without its break.
 * @param start - Offset of the line in the text.
 * @param lineNo - 1-based line number.
 */
function scanLine(scan: ScanUnderway, line: string, start: number, lineNo: number): void {
  const heading = headingOf(line, start);
  if (heading !== undefined) {
    scan.headings.push(heading);
  }
  const lineImages = imagesOf(line, start, lineNo);
  lineImages.found.forEach((image) => scan.images.push(image));
  if (lineImages.exhausted) {
    scan.unscannedLines.push(lineNo);
  }
  scan.htmlImages += line.toLowerCase().includes('<img ') ? 1 : 0;
}

/**
 * Scans a Markdown text for headings and inline images.
 * @param text - Markdown.
 * @returns Headings, images, the number of inline HTML images and the lines left unscanned.
 */
export function scanMarkdown(text: string): MarkdownScan {
  const scan: ScanUnderway = { headings: [], images: [], unscannedLines: [], htmlImages: 0 };
  let fence: Fence | undefined;
  let start = 0;
  let lineNo = 0;
  while (start <= text.length) {
    const nl = text.indexOf('\n', start);
    const raw = text.slice(start, nl < 0 ? text.length : nl);
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    lineNo += 1;
    const inside = fence !== undefined;
    fence = fence === undefined ? openFence(line) : closesFence(line, fence) ? undefined : fence;
    if (!inside && fence === undefined) {
      scanLine(scan, line, start, lineNo);
    }
    if (nl < 0) {
      break;
    }
    start = nl + 1;
  }
  return scan;
}
