/**
 * Literal word matching for recall (WL-16, WL-47): text is split into lower-case word tokens by
 * one linear scan (letters and digits form a word, everything else separates), and a query token
 * matches a memory when the same token occurs in it. Nothing in the query is a pattern.
 */

/** Longest query accepted. */
export const MAX_QUERY_CHARS = 1_000;

/**
 * Tells whether a character belongs to a word.
 * @param ch - One character.
 * @returns `true` for letters and digits (any script) and `_`.
 */
function isWordChar(ch: string): boolean {
  return ch === '_' || ch.toLowerCase() !== ch.toUpperCase() || (ch >= '0' && ch <= '9');
}

/**
 * Splits a text into lower-case word tokens.
 * @param text - Text.
 * @returns Tokens in order of appearance (duplicates kept).
 */
export function wordTokens(text: string): string[] {
  const tokens: string[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const inWord = i < text.length && isWordChar(text.charAt(i));
    if (inWord && start < 0) {
      start = i;
    } else if (!inWord && start >= 0) {
      tokens.push(text.slice(start, i).toLowerCase());
      start = -1;
    }
  }
  return tokens;
}

/**
 * Distinct word tokens of a text.
 * @param text - Text.
 * @returns The token set.
 */
export function tokenSet(text: string): Set<string> {
  return new Set(wordTokens(text));
}

/**
 * Counts the distinct query tokens present in a token set.
 * @param query - Distinct query tokens.
 * @param tokens - Memory tokens.
 * @returns How many query tokens matched.
 */
export function matchedTokens(query: readonly string[], tokens: ReadonlySet<string>): number {
  return query.filter((t) => tokens.has(t)).length;
}
