/**
 * Character-class predicates used by the linear matchers (no regular expressions).
 */

/**
 * Tells whether a character is an ASCII letter or digit.
 * @param ch - One character (may be empty at end of input).
 * @returns `true` for `A-Z`, `a-z`, `0-9`.
 */
export function isAlnum(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || isDigit(ch);
}

/**
 * Tells whether a character is an ASCII decimal digit.
 * @param ch - One character.
 * @returns `true` for `0-9`.
 */
export function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Tells whether a character is a lower-case ASCII letter or digit.
 * @param ch - One character.
 * @returns `true` for `a-z`, `0-9`.
 */
export function isLowerAlnum(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || isDigit(ch);
}

/**
 * Tells whether a character is an upper-case letter or digit.
 * @param ch - One character.
 * @returns `true` for `A-Z`, `0-9`.
 */
export function isUpperAlnum(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || isDigit(ch);
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

/**
 * Tells whether a code point is punctuation or a symbol outside ASCII (dropped from anchors):
 * Latin-1 punctuation, general punctuation to dingbats, CJK and full-width punctuation, emoji.
 * @param cp - Code point.
 * @returns `true` when dropped.
 */
export function isWidePunctuation(cp: number): boolean {
  const dropped: readonly (readonly [number, number])[] = [[0x80, 0xa9], [0xab, 0xb4], [0xb6, 0xb9], [0xbb, 0xbf], [0x2000, 0x2bff], [0x3000, 0x303f], [0xfe30, 0xfe6f], [0xff00, 0xff0f], [0xff1a, 0xff20], [0xff3b, 0xff40], [0xff5b, 0xff65], [0x1f000, 0x1faff]];
  return dropped.some(([from, to]) => cp >= from && cp <= to);
}
