/**
 * Literal word matching for recall (WL-16, WL-47): text is split into lower-case word tokens by
 * one linear scan (letters and digits form a word, everything else separates; characters of
 * scripts without spaces are one token each), and a query token
 * matches a memory when the same token occurs in it. Nothing in the query is a pattern.
 */
import { isWidePunctuation } from '../../core/security/char-classes.ts';


/** Longest query accepted. */
export const MAX_QUERY_CHARS = 1_000;

/**
 * Tells whether a character belongs to a word.
 * @param ch - One character.
 * @returns `true` for letters with a case (Latin, Cyrillic, Greek…), digits and `_`.
 */
function isWordChar(ch: string): boolean {
  return ch === '_' || ch.toLowerCase() !== ch.toUpperCase() || (ch >= '0' && ch <= '9');
}

/**
 * Tells whether a character is a letter of a script written without spaces or case (Han, kana,
 * Hangul, Thai, Arabic…). Such text has no word boundaries to scan for, so each of these
 * characters is a token of its own: a query matches a memory that holds all its characters.
 * @param ch - One character (a UTF-16 unit; surrogate halves are not letters of this kind).
 * @returns `true` for a caseless, non-punctuation character beyond ASCII.
 */
function isCaselessLetter(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp >= 0x80 && ch.toLowerCase() === ch.toUpperCase() && !isWidePunctuation(cp) && !(cp >= 0xd800 && cp <= 0xdfff);
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
    const ch = text.charAt(i);
    const inWord = i < text.length && isWordChar(ch);
    const single = i < text.length && !inWord && isCaselessLetter(ch);
    if (inWord && start < 0) {
      start = i;
    } else if (!inWord && start >= 0) {
      tokens.push(text.slice(start, i).toLowerCase());
      start = -1;
    }
    if (single) {
      tokens.push(ch);
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
