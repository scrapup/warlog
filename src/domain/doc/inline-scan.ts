/**
 * Linear helpers of the Markdown scanner (WL-48): inline code spans and bracket pairs found in one
 * pass over a line, and a search that never looks past a fixed window. A line may be megabytes of
 * hostile text, so nothing here may rescan the line once per candidate.
 */

/**
 * Length of the run of a character at an index.
 * @param line - Text.
 * @param at - Index.
 * @param ch - Character.
 * @returns Number of consecutive occurrences.
 */
export function runLength(line: string, at: number, ch: string): number {
  let n = 0;
  while (line.charAt(at + n) === ch) {
    n += 1;
  }
  return n;
}

/** A run of backticks. */
interface TickRun {
  /** Index of its first backtick. */
  readonly start: number;
  /** Its length. */
  readonly length: number;
}

/**
 * Every run of backticks of a line, in order.
 * @param line - Line.
 * @returns The runs.
 */
function tickRuns(line: string): TickRun[] {
  const runs: TickRun[] = [];
  let i = line.indexOf('`');
  while (i >= 0) {
    const length = runLength(line, i, '`');
    runs.push({ start: i, length });
    i = line.indexOf('`', i + length);
  }
  return runs;
}

/**
 * For each run, the index of the next run of exactly the same length (`-1` when none), computed
 * backwards in one pass.
 * @param runs - Runs in order.
 * @returns A partner index per run.
 */
function partners(runs: readonly TickRun[]): number[] {
  const nextOfLength = new Map<number, number>();
  const out = runs.map(() => -1);
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (run !== undefined) {
      out[i] = nextOfLength.get(run.length) ?? -1;
      nextOfLength.set(run.length, i);
    }
  }
  return out;
}

/**
 * Which characters of a line lie inside inline code spans (a span opens at a backtick run and
 * closes at the next run of exactly the same length).
 * @param line - Line.
 * @returns A boolean per character: `true` when inside a code span.
 */
export function codeMask(line: string): boolean[] {
  const mask = new Array<boolean>(line.length).fill(false);
  const runs = tickRuns(line);
  const partner = partners(runs);
  let i = 0;
  while (i < runs.length) {
    const close = partner[i] ?? -1;
    const open = runs[i];
    const end = runs[close];
    if (close < 0 || open === undefined || end === undefined) {
      i += 1;
    } else {
      mask.fill(true, open.start, end.start + end.length);
      i = close + 1;
    }
  }
  return mask;
}

/**
 * Pairs every `[` of a line with its closing `]` (nesting honoured, a backslash escapes the next
 * character) in one pass.
 * @param line - Line.
 * @returns A map from the index of `[` to the index of its `]`; unmatched brackets are absent.
 */
export function bracketPairs(line: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const open: number[] = [];
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (ch === '\\') {
      i += 1;
    } else if (ch === '[') {
      open.push(i);
    } else if (ch === ']' && open.length > 0) {
      pairs.set(open.pop() ?? 0, i);
    }
  }
  return pairs;
}

/**
 * Index of a character within a window.
 * @param line - Line.
 * @param ch - Character to find.
 * @param from - Where to start.
 * @param window - How many characters to look at.
 * @returns The index, or `-1` when it is not in the window.
 */
export function indexWithin(line: string, ch: string, from: number, window: number): number {
  const end = Math.min(line.length, from + window);
  for (let i = from; i < end; i += 1) {
    if (line.charAt(i) === ch) {
      return i;
    }
  }
  return -1;
}
