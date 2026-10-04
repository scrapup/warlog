/**
 * Detection of known secret formats in untrusted values (WL-09, SEC-21). Every pattern is a
 * fixed prefix found by `indexOf`, followed by a bounded character-class run: linear in the
 * input length, no regular expression.
 */
import { WarlogError } from '../errors/warlog-error.ts';
import { isAlnum, isTokenChar, isUpperAlnum, isWord, runLength } from './char-classes.ts';

/** One detected secret; the secret itself is never reported (a secret object key is shown as `<key#N>`). */
export interface SecretFinding {
  /** Kind of secret, e.g. `github-token`. */
  readonly kind: string;
  /** Location in the value (`$` root, `.field`, `[index]`). */
  readonly path: string;
}

/** A fixed-prefix secret pattern. */
interface SecretPattern {
  /** Reported kind. */
  readonly kind: string;
  /** Literal prefixes. */
  readonly prefixes: readonly string[];
  /** Body character class. */
  readonly accept: (ch: string) => boolean;
  /** Minimum body length. */
  readonly min: number;
  /** Maximum body length scanned. */
  readonly max: number;
}

/** Maximum nesting depth walked (deeper input is rejected, SEC-23). */
export const MAX_SECRET_SCAN_DEPTH = 64;

/** Patterns of plan §5.2. */
const PATTERNS: readonly SecretPattern[] = [
  { kind: 'github-token', prefixes: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'], accept: isAlnum, min: 36, max: 36 },
  { kind: 'github-pat', prefixes: ['github_pat_'], accept: isWord, min: 82, max: 82 },
  { kind: 'npm-token', prefixes: ['npm_'], accept: isAlnum, min: 36, max: 36 },
  { kind: 'api-key', prefixes: ['sk-'], accept: isTokenChar, min: 20, max: 200 },
  { kind: 'slack-token', prefixes: ['xoxa-', 'xoxb-', 'xoxp-', 'xoxr-', 'xoxs-'], accept: isTokenChar, min: 10, max: 200 },
  { kind: 'aws-access-key', prefixes: ['AKIA'], accept: isUpperAlnum, min: 16, max: 16 },
];

/**
 * Tells whether a prefix occurrence starts a token (not glued to a preceding token char).
 * @param text - Input.
 * @param index - Prefix position.
 * @returns `true` at the start of input or after a non-token character.
 */
function atBoundary(text: string, index: number): boolean {
  return index === 0 || !isTokenChar(text.charAt(index - 1));
}

/**
 * Tells whether a pattern occurs in a string.
 * @param text - Input.
 * @param pattern - Secret pattern.
 * @returns `true` when a prefix is followed by a long-enough body.
 */
function matchesPattern(text: string, pattern: SecretPattern): boolean {
  for (const prefix of pattern.prefixes) {
    for (let i = text.indexOf(prefix); i >= 0; i = text.indexOf(prefix, i + 1)) {
      if (atBoundary(text, i) && runLength(text, i + prefix.length, pattern.accept, pattern.max) >= pattern.min) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Tells whether a string contains a PEM private-key header.
 * @param text - Input.
 * @returns `true` for `-----BEGIN … PRIVATE KEY-----`.
 */
function hasPrivateKey(text: string): boolean {
  for (let i = text.indexOf('-----BEGIN '); i >= 0; i = text.indexOf('-----BEGIN ', i + 1)) {
    const end = text.indexOf('-----', i + 11);
    if (end > 0 && end - i <= 64 && text.slice(i, end).endsWith('PRIVATE KEY')) {
      return true;
    }
  }
  return false;
}

/**
 * Scans one string.
 * @param text - Input.
 * @param path - Location.
 * @returns Findings for this string.
 */
function scanString(text: string, path: string): SecretFinding[] {
  const found: SecretFinding[] = PATTERNS.filter((p) => matchesPattern(text, p)).map((p) => ({ kind: p.kind, path }));
  return hasPrivateKey(text) ? [...found, { kind: 'private-key', path }] : found;
}

/**
 * Walks a parsed value and scans every string leaf (object keys included).
 * @param value - Parsed JSON/YAML value (no cycles).
 * @param path - Location of `value`.
 * @param depth - Current depth.
 * @returns Findings.
 * @throws {WarlogError} `VALIDATION` when nesting exceeds {@link MAX_SECRET_SCAN_DEPTH}.
 */
function walk(value: unknown, path: string, depth: number): SecretFinding[] {
  if (depth > MAX_SECRET_SCAN_DEPTH) {
    throw new WarlogError('VALIDATION', `value nested deeper than ${MAX_SECRET_SCAN_DEPTH} levels`, { path });
  }
  if (typeof value === 'string') {
    return scanString(value, path);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => walk(item, `${path}[${i}]`, depth + 1));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item], index) => {
      const redacted = `${path}.<key#${index}>`;
      const keyFindings = scanString(key, redacted);
      return [...keyFindings, ...walk(item, keyFindings.length > 0 ? redacted : `${path}.${key}`, depth + 1)];
    });
  }
  return [];
}

/** Scans untrusted values for secrets. */
export class SecretGuard {
  /**
   * Scans every string leaf of a value.
   * @param value - Parsed input (string, array, object; other leaves ignored).
   * @returns Findings (empty when clean).
   * @throws {WarlogError} `VALIDATION` when nested deeper than {@link MAX_SECRET_SCAN_DEPTH}.
   */
  scan(value: unknown): SecretFinding[] {
    return walk(value, '$', 0);
  }

  /**
   * Rejects a value containing a secret.
   * @param value - Parsed input.
   * @returns Nothing.
   * @throws {WarlogError} `SECRET_REJECTED` listing kinds and locations (never the secret).
   */
  assertClean(value: unknown): void {
    const findings = this.scan(value);
    if (findings.length > 0) {
      throw new WarlogError('SECRET_REJECTED', 'value matches a known secret pattern; nothing was written', { findings });
    }
  }
}
