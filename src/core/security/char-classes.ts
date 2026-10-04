/**
 * Character-class predicates used by the linear matchers (no regular expressions).
 */

/**
 * Tells whether a character is an ASCII letter or digit.
 * @param ch - One character (may be empty at end of input).
 * @returns `true` for `A-Z`, `a-z`, `0-9`.
 */
export function isAlnum(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
}

/**
 * Tells whether a character is an upper-case letter or digit.
 * @param ch - One character.
 * @returns `true` for `A-Z`, `0-9`.
 */
export function isUpperAlnum(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
}

/**
 * Tells whether a character is a word character (`A-Za-z0-9_`).
 * @param ch - One character.
 * @returns `true` for word characters.
 */
export function isWord(ch: string): boolean {
  return isAlnum(ch) || ch === '_';
}

/**
 * Tells whether a character is a token character (`A-Za-z0-9_-`).
 * @param ch - One character.
 * @returns `true` for token characters.
 */
export function isTokenChar(ch: string): boolean {
  return isWord(ch) || ch === '-';
}

/**
 * Counts consecutive characters satisfying a predicate, stopping at `max`.
 * @param text - Input.
 * @param start - First index.
 * @param accept - Character predicate.
 * @param max - Upper bound of the count (keeps the scan bounded).
 * @returns The run length (≤ `max`).
 */
export function runLength(text: string, start: number, accept: (ch: string) => boolean, max: number): number {
  let n = 0;
  while (n < max && start + n < text.length && accept(text.charAt(start + n))) {
    n += 1;
  }
  return n;
}
