/**
 * Validation of identifiers, names and slugs used to build store paths (WL-49). Character
 * loops only (no regular expression); invalid input is rejected, never normalized (SEC-23).
 */
import { WarlogError } from '../errors/warlog-error.ts';
import { isAlnum, isLowerAlnum } from './char-classes.ts';

/** Crockford base32 alphabet of ULIDs (upper case). */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Tells whether a text is a ULID (26 Crockford base32 characters, first ≤ `7`).
 * @param text - Candidate.
 * @returns `true` for a valid ULID.
 */
export function isUlid(text: string): boolean {
  return text.length === 26 && text.charAt(0) <= '7' && [...text].every((ch) => ULID_ALPHABET.includes(ch));
}

/**
 * Tells whether a text is a variable name: `[a-z0-9_.-]{1,128}`, no `..`, not starting or
 * ending with `.`.
 * @param text - Candidate.
 * @returns `true` for a valid name.
 */
export function isVarName(text: string): boolean {
  const charsOk = [...text].every((ch) => isLowerAlnum(ch) || ch === '_' || ch === '.' || ch === '-');
  return text.length >= 1 && text.length <= 128 && charsOk && !text.includes('..') && !text.startsWith('.') && !text.endsWith('.');
}

/**
 * Tells whether a text is a slug: `[a-z0-9-]{1,80}`, not starting with `-`.
 * @param text - Candidate.
 * @returns `true` for a valid slug.
 */
export function isSlug(text: string): boolean {
  return text.length >= 1 && text.length <= 80 && !text.startsWith('-') && [...text].every((ch) => isLowerAlnum(ch) || ch === '-');
}

/**
 * Tells whether a text is a repository key: `[A-Za-z0-9._-]{1,200}`, no `..`.
 * @param text - Candidate.
 * @returns `true` for a valid key.
 */
export function isRepoKey(text: string): boolean {
  const charsOk = [...text].every((ch) => isAlnum(ch) || ch === '_' || ch === '.' || ch === '-');
  return text.length >= 1 && text.length <= 200 && charsOk && !text.includes('..') && !text.startsWith('.');
}

/**
 * Asserts a validator, raising `VALIDATION` otherwise.
 * @param ok - Validation outcome.
 * @param field - Field name for the error.
 * @param expected - Human-readable expectation.
 * @returns Nothing.
 * @throws {WarlogError} `VALIDATION` when `ok` is false.
 */
export function assertValid(ok: boolean, field: string, expected: string): void {
  if (!ok) {
    throw new WarlogError('VALIDATION', `${field} must be ${expected}`, { field });
  }
}
