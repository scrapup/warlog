/**
 * Path glob matching for `pattern` memories (WL-20, WL-48). Supports `*` (within a segment),
 * `**` (any number of segments) and `?` (one character). Iterative set-of-positions
 * simulation: O(path × pattern) with the pattern bounded, no regular expression.
 */
import { WarlogError } from '../errors/warlog-error.ts';

/** Maximum accepted pattern length. */
export const MAX_GLOB_LENGTH = 256;

/** A literal character token. */
interface LiteralToken {
  /** Token kind. */
  readonly kind: 'literal';
  /** Character to match. */
  readonly ch: string;
}

/** A wildcard token. */
interface WildcardToken {
  /** `any` (`?`), `star` (`*`), `globstar` (`**`) or `globstar-dir` (`**` + `/`). */
  readonly kind: 'any' | 'star' | 'globstar' | 'globstar-dir';
}

/** One compiled glob token. */
type Token = LiteralToken | WildcardToken;

/**
 * Token of a single pattern character.
 * @param ch - Pattern character.
 * @returns `star` for `*`, `any` for `?`, a literal otherwise.
 */
function charToken(ch: string): Token {
  if (ch === '*') {
    return { kind: 'star' };
  }
  if (ch === '?') {
    return { kind: 'any' };
  }
  return { kind: 'literal', ch };
}

/**
 * Compiles a pattern into tokens.
 * @param pattern - Glob pattern.
 * @returns Tokens.
 */
function compile(pattern: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      tokens.push({ kind: 'globstar-dir' });
      i += 3;
    } else if (pattern.startsWith('**', i)) {
      tokens.push({ kind: 'globstar' });
      i += 2;
    } else {
      tokens.push(charToken(pattern.charAt(i)));
      i += 1;
    }
  }
  return tokens;
}

/**
 * Advances the reachable positions over one single-character token.
 * @param path - Subject path.
 * @param from - Reachable positions.
 * @param accept - Character predicate.
 * @returns Next reachable positions.
 */
function stepChar(path: string, from: readonly boolean[], accept: (ch: string) => boolean): boolean[] {
  const next = new Array<boolean>(path.length + 1).fill(false);
  for (let p = 0; p < path.length; p += 1) {
    next[p + 1] = from[p] === true && accept(path.charAt(p));
  }
  return next;
}

/**
 * Advances the reachable positions over a multi-character token.
 * @param path - Subject path.
 * @param from - Reachable positions.
 * @param kind - `star` (no `/`), `globstar` (anything) or `globstar-dir` (whole segments).
 * @returns Next reachable positions.
 */
function stepMulti(path: string, from: readonly boolean[], kind: 'star' | 'globstar' | 'globstar-dir'): boolean[] {
  const next = new Array<boolean>(path.length + 1).fill(false);
  let open = false;
  for (let p = 0; p <= path.length; p += 1) {
    open = open || from[p] === true;
    if (kind === 'globstar-dir') {
      next[p] = from[p] === true || (open && p > 0 && path.charAt(p - 1) === '/');
    } else {
      next[p] = open;
      if (kind === 'star' && path.charAt(p) === '/') {
        open = false;
      }
    }
  }
  return next;
}

/** Matches `/`-separated paths against glob patterns. */
export class GlobMatcher {
  /**
   * Tests a path against a pattern.
   * @param pattern - Glob (≤ {@link MAX_GLOB_LENGTH} characters).
   * @param path - Subject path, `/`-separated.
   * @returns `true` when the whole path matches.
   * @throws {WarlogError} `VALIDATION` when the pattern is too long.
   */
  matches(pattern: string, path: string): boolean {
    if (pattern.length > MAX_GLOB_LENGTH) {
      throw new WarlogError('VALIDATION', `glob longer than ${MAX_GLOB_LENGTH} characters`, { length: pattern.length });
    }
    let reach = new Array<boolean>(path.length + 1).fill(false);
    reach[0] = true;
    for (const token of compile(pattern)) {
      if (token.kind === 'literal') {
        reach = stepChar(path, reach, (ch) => ch === token.ch);
      } else if (token.kind === 'any') {
        reach = stepChar(path, reach, (ch) => ch !== '/');
      } else {
        reach = stepMulti(path, reach, token.kind);
      }
    }
    return reach[path.length] === true;
  }
}
