/**
 * Literal text matching for search and recall (WL-47): the query is split on whitespace into
 * tokens and each token must appear, case-insensitively, as a plain substring. Nothing in the
 * query is interpreted as a pattern.
 */

/** Characters kept in a list excerpt. */
export const EXCERPT_CHARS = 120;

/**
 * Splits a query into lower-case tokens.
 * @param query - Caller text.
 * @returns Tokens (empty for a blank query).
 */
export function tokensOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== '');
}

/**
 * Counts the tokens found in a text.
 * @param tokens - Lower-case tokens.
 * @param haystack - Text searched.
 * @returns Number of tokens present.
 */
export function matchCount(tokens: readonly string[], haystack: string): number {
  const lower = haystack.toLowerCase();
  return tokens.filter((t) => lower.includes(t)).length;
}

/**
 * Tells whether every token appears in a text.
 * @param tokens - Lower-case tokens.
 * @param haystack - Text searched.
 * @returns `true` when all tokens are present (and there is at least one).
 */
export function matchesAll(tokens: readonly string[], haystack: string): boolean {
  return tokens.length > 0 && matchCount(tokens, haystack) === tokens.length;
}

/**
 * Short excerpt of a body for list rows.
 * @param body - Body.
 * @returns At most {@link EXCERPT_CHARS} characters, single line, `…` when cut.
 */
export function excerpt(body: string): string {
  const flat = body.split(/\s+/).filter((w) => w !== '').join(' ');
  return flat.length <= EXCERPT_CHARS ? flat : `${flat.slice(0, EXCERPT_CHARS).trimEnd()}…`;
}
