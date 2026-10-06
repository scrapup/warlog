/**
 * Linear Markdown scanners used by the document registry (WL-61, WL-62, WL-66, WL-48): ATX
 * headings and inline image links, skipping fenced code blocks and inline code spans. No regular
 * expressions: one pass over the text, a bounded amount of work per character.
 */

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
}

/** Longest alt text or destination looked at, bounding the work per link. */
const MAX_LINK_PART = 4_096;

/** An open fenced code block. */
interface Fence {
  /** Fence character (`` ` `` or `~`). */
  readonly char: string;
  /** Length of the opening fence. */
  readonly length: number;
}

/**
 * Length of the run of a character at an index.
 * @param line - Text.
 * @param at - Index.
 * @param ch - Character.
 * @returns Number of consecutive occurrences.
 */
function runAt(line: string, at: number, ch: string): number {
  let n = 0;
  while (line.charAt(at + n) === ch) {
    n += 1;
  }
  return n;
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
  const length = runAt(line, at, char);
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
  return at >= 0 && line.charAt(at) === fence.char && runAt(line, at, fence.char) >= fence.length && line.slice(at + runAt(line, at, fence.char)).trim() === '';
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
  const level = runAt(line, at, '#');
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

/**
 * Offsets of the characters of a line that are not inside inline code spans.
 * @param line - Line.
 * @returns A boolean per character: `true` when inside a code span.
 */
function codeMask(line: string): boolean[] {
  const mask = new Array<boolean>(line.length).fill(false);
  let i = 0;
  while (i < line.length) {
    if (line.charAt(i) !== '`') {
      i += 1;
      continue;
    }
    const run = runAt(line, i, '`');
    const close = findRun(line, i + run, run);
    if (close < 0) {
      i += run;
      continue;
    }
    mask.fill(true, i, close + run);
    i = close + run;
  }
  return mask;
}

/**
 * Index of the next backtick run of exactly a given length.
 * @param line - Line.
 * @param from - Where to start.
 * @param length - Run length.
 * @returns The index, or `-1`.
 */
function findRun(line: string, from: number, length: number): number {
  let i = from;
  while (i < line.length) {
    if (line.charAt(i) !== '`') {
      i += 1;
      continue;
    }
    const run = runAt(line, i, '`');
    if (run === length) {
      return i;
    }
    i += run;
  }
  return -1;
}

/**
 * Index of the `]` closing an alt text that starts after `![`.
 * @param line - Line.
 * @param from - Index after `![`.
 * @returns The index, or `-1` when unbalanced within {@link MAX_LINK_PART} characters.
 */
function closeBracket(line: string, from: number): number {
  let depth = 1;
  for (let i = from; i < line.length && i - from <= MAX_LINK_PART; i += 1) {
    const ch = line.charAt(i);
    if (ch === '\\') {
      i += 1;
    } else if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
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
  const close = line.indexOf('>', open + 1);
  return close < 0 || line.slice(open + 1, close).includes('<') ? undefined : { start: open + 1, end: close, next: close + 1 };
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
    const end = line.indexOf(quote === '(' ? ')' : quote, i + 1);
    if (end < 0) {
      return -1;
    }
    i = skipBlanks(line, end + 1);
  }
  return line.charAt(i) === ')' ? i + 1 : -1;
}

/**
 * Inline images of one line.
 * @param line - Line without its break.
 * @param start - Offset of the line in the text.
 * @param lineNo - 1-based line number.
 * @returns The images found outside inline code.
 */
function imagesOf(line: string, start: number, lineNo: number): ImageLink[] {
  const mask = line.includes('![') ? codeMask(line) : [];
  const found: ImageLink[] = [];
  let at = line.indexOf('![');
  while (at >= 0) {
    const next = tryImage(line, at, mask);
    if (next !== undefined) {
      found.push({ alt: line.slice(at + 2, next.altEnd), destStart: start + next.dest.start, destEnd: start + next.dest.end, dest: line.slice(next.dest.start, next.dest.end), line: lineNo });
    }
    at = line.indexOf('![', next === undefined ? at + 2 : next.dest.next);
  }
  return found;
}

/** A parsed image link. */
interface ParsedImage {
  /** Index of the `]` closing the alt text. */
  readonly altEnd: number;
  /** The destination. */
  readonly dest: Destination;
}

/**
 * Parses the image link starting at `![`.
 * @param line - Line.
 * @param at - Index of `!`.
 * @param mask - Inline code mask of the line.
 * @returns The parsed image, or `undefined` when it is not a valid inline image.
 */
function tryImage(line: string, at: number, mask: readonly boolean[]): ParsedImage | undefined {
  if (mask[at] === true || line.charAt(at - 1) === '\\') {
    return undefined;
  }
  const altEnd = closeBracket(line, at + 2);
  if (altEnd < 0 || line.charAt(altEnd + 1) !== '(') {
    return undefined;
  }
  const i = skipBlanks(line, altEnd + 2);
  const dest = line.charAt(i) === '<' ? angleDestination(line, i) : plainDestination(line, i);
  const closed = dest === undefined ? -1 : closeLink(line, dest.next);
  return dest === undefined || closed < 0 ? undefined : { altEnd, dest: { ...dest, next: closed } };
}

/**
 * Scans a Markdown text for headings and inline images.
 * @param text - Markdown.
 * @returns Headings, images and the number of inline HTML images.
 */
export function scanMarkdown(text: string): MarkdownScan {
  const headings: Heading[] = [];
  const images: ImageLink[] = [];
  let htmlImages = 0;
  let fence: Fence | undefined;
  let start = 0;
  let lineNo = 0;
  while (start <= text.length) {
    const nl = text.indexOf('\n', start);
    const end = nl < 0 ? text.length : nl;
    const raw = text.slice(start, end);
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    lineNo += 1;
    if (fence !== undefined) {
      fence = closesFence(line, fence) ? undefined : fence;
    } else {
      fence = openFence(line);
      if (fence === undefined) {
        const heading = headingOf(line, start);
        if (heading !== undefined) {
          headings.push(heading);
        }
        images.push(...imagesOf(line, start, lineNo));
        htmlImages += line.toLowerCase().includes('<img ') ? 1 : 0;
      }
    }
    if (nl < 0) {
      break;
    }
    start = nl + 1;
  }
  return { headings, images, htmlImages };
}
