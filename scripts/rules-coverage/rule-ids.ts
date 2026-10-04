/**
 * Rule identifier parsing and the code-level rule sets of plan §7.4.
 */

/** Inclusive numeric range of one rule family that must be proven by automated tests. */
interface RuleRange {
  /** Rule family prefix, e.g. `WL`. */
  readonly prefix: string;
  /** First number of the range. */
  readonly from: number;
  /** Last number of the range. */
  readonly to: number;
}

/** Code-level rules: WL-01..WL-49, WL-57..WL-75, SEC-21..SEC-24. */
export const CODE_LEVEL_RANGES: readonly RuleRange[] = [
  { prefix: 'WL', from: 1, to: 49 },
  { prefix: 'WL', from: 57, to: 75 },
  { prefix: 'SEC', from: 21, to: 24 },
];

/** Parsed form of a rule identifier such as `WL-07`. */
export interface ParsedRuleId {
  /** Family prefix (`WL`, `SEC`). */
  readonly prefix: string;
  /** Rule number. */
  readonly number: number;
}

/**
 * Tells whether a character is an ASCII decimal digit.
 * @param ch - Single character.
 * @returns `true` for `0`..`9`.
 */
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Tells whether a character is an ASCII upper-case letter.
 * @param ch - Single character.
 * @returns `true` for `A`..`Z`.
 */
function isUpper(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

/**
 * Parses a rule identifier of the form `<UPPER>+-<digits>` (e.g. `WL-07`, `SEC-21`).
 * @param text - Candidate identifier (already trimmed).
 * @returns The parsed identifier, or `undefined` when the text is not one.
 */
export function parseRuleId(text: string): ParsedRuleId | undefined {
  const dash = text.indexOf('-');
  if (dash < 1 || dash === text.length - 1 || text.length > 16) {
    return undefined;
  }
  const prefix = text.slice(0, dash);
  const digits = text.slice(dash + 1);
  if (![...prefix].every(isUpper) || ![...digits].every(isDigit)) {
    return undefined;
  }
  return { prefix, number: Number(digits) };
}

/**
 * Tells whether a rule must be proven by an automated test.
 * @param id - Rule identifier, e.g. `WL-42`.
 * @returns `true` when the rule belongs to a code-level range.
 */
export function isCodeLevel(id: string): boolean {
  const parsed = parseRuleId(id);
  if (parsed === undefined) {
    return false;
  }
  return CODE_LEVEL_RANGES.some((r) => r.prefix === parsed.prefix && parsed.number >= r.from && parsed.number <= r.to);
}

/**
 * Extracts the rule identifiers declared in the rule tables of a specification: every
 * Markdown table row whose first cell is a rule identifier.
 * @param specText - Specification Markdown.
 * @returns Unique identifiers in order of appearance.
 */
export function extractSpecRuleIds(specText: string): string[] {
  const ids = new Set<string>();
  for (const line of specText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      continue;
    }
    const end = trimmed.indexOf('|', 1);
    const firstCell = (end < 0 ? trimmed.slice(1) : trimmed.slice(1, end)).trim();
    if (parseRuleId(firstCell) !== undefined) {
      ids.add(firstCell);
    }
  }
  return [...ids];
}

/**
 * Extracts the rule identifiers prefixed to a test title: leading `[ID]` groups such as
 * `[WL-42][WL-41] rejects …`.
 * @param title - Test title.
 * @returns Identifiers found in the leading bracket groups.
 */
export function extractTitleRuleIds(title: string): string[] {
  const ids: string[] = [];
  let rest = title.trimStart();
  while (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close < 0) {
      break;
    }
    const candidate = rest.slice(1, close).trim();
    if (parseRuleId(candidate) !== undefined) {
      ids.push(candidate);
    }
    rest = rest.slice(close + 1).trimStart();
  }
  return ids;
}
