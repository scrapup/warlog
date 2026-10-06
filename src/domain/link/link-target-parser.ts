/**
 * Link targets (plan §3.2, WL-21): an entity id (ULID) or a prefixed reference to something
 * outside the store — `spec:<path>[#<anchor>]`, `git:<sha>`, `test:<path>::<name>`,
 * `file:<path>[:<line>]`, `url:https://…`. Parsed by prefix and character scans, never by a
 * regular expression (WL-48); repository paths stay relative and cannot climb out of the tree.
 */
import { isUlid } from '../../core/security/identifiers.ts';

/** Relations a link can have (WL-21). */
export const LINK_RELATIONS = ['implements', 'tests', 'commit', 'derived_from', 'supersedes', 'relates'] as const;

/** A link relation. */
export type LinkRelation = (typeof LINK_RELATIONS)[number];

/** What a link target points at. */
export type TargetKind = 'entity' | 'spec' | 'git' | 'test' | 'file' | 'url';

/** A parsed link target. */
export interface LinkTarget {
  /** Kind. */
  readonly kind: TargetKind;
  /** The target text as stored. */
  readonly text: string;
}

/** Longest target accepted. */
export const MAX_TARGET_CHARS = 2_048;

/** Longest path inside a target. */
const MAX_PATH_CHARS = 1_024;

/** Prefixes that are not entity ids. */
const PREFIXES: readonly TargetKind[] = ['spec', 'git', 'test', 'file', 'url'];

/**
 * Tells whether a text has no control characters.
 * @param text - Text.
 * @returns `true` when every character is printable.
 */
function isPlainText(text: string): boolean {
  return [...text].every((c) => c >= ' ' && c !== '\u007f');
}

/**
 * Tells whether a text is a safe repository-relative path: no control characters, no backslash,
 * not absolute, no `..` segment.
 * @param path - Path text.
 * @returns `true` for a safe relative path.
 */
export function isRelativePath(path: string): boolean {
  return path.length > 0 && path.length <= MAX_PATH_CHARS && isPlainText(path) && !path.includes('\\') && !path.startsWith('/') && !path.split('/').includes('..');
}

/**
 * Tells whether a text is made of decimal digits only.
 * @param text - Text.
 * @returns `true` for a non-empty digit string.
 */
function isDigits(text: string): boolean {
  return text.length > 0 && [...text].every((c) => c >= '0' && c <= '9');
}

/**
 * Tells whether a `spec:` body is valid (`<path>` or `<path>#<anchor>`).
 * @param body - Text after the prefix.
 * @returns `true` when valid.
 */
function isSpec(body: string): boolean {
  const hash = body.indexOf('#');
  const path = hash < 0 ? body : body.slice(0, hash);
  const anchor = hash < 0 ? undefined : body.slice(hash + 1);
  return isRelativePath(path) && (anchor === undefined || (anchor.length > 0 && isPlainText(anchor)));
}

/**
 * Tells whether a `git:` body is a hexadecimal object name.
 * @param body - Text after the prefix.
 * @returns `true` for 7 to 64 lower-case hex digits.
 */
function isGit(body: string): boolean {
  return body.length >= 7 && body.length <= 64 && [...body].every((c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'));
}

/**
 * Tells whether a `test:` body is valid (`<path>::<name>`).
 * @param body - Text after the prefix.
 * @returns `true` when valid.
 */
function isTest(body: string): boolean {
  const at = body.indexOf('::');
  const name = at < 0 ? '' : body.slice(at + 2);
  return at > 0 && isRelativePath(body.slice(0, at)) && name.length > 0 && name.length <= 500 && isPlainText(name);
}

/**
 * Tells whether a `file:` body is valid (`<path>` or `<path>:<line>`).
 * @param body - Text after the prefix.
 * @returns `true` when valid.
 */
function isFile(body: string): boolean {
  const colon = body.lastIndexOf(':');
  const line = colon < 0 ? undefined : body.slice(colon + 1);
  return line !== undefined && isDigits(line) ? Number(line) >= 1 && isRelativePath(body.slice(0, colon)) : isRelativePath(body);
}

/**
 * Tells whether a `url:` body is an https URL without whitespace.
 * @param body - Text after the prefix.
 * @returns `true` when valid.
 */
export function isHttpsUrl(body: string): boolean {
  return body.startsWith('https://') && body.length > 'https://'.length && body.length <= MAX_TARGET_CHARS && isPlainText(body) && !body.includes(' ');
}

/** Checks of each prefixed kind. */
const CHECKS: Readonly<Record<string, (body: string) => boolean>> = { spec: isSpec, git: isGit, test: isTest, file: isFile, url: isHttpsUrl };

/**
 * Parses a link target.
 * @param text - Target text.
 * @returns The target, or `undefined` when it is neither an entity id nor a valid reference.
 */
export function parseLinkTarget(text: string): LinkTarget | undefined {
  if (text.length > MAX_TARGET_CHARS) {
    return undefined;
  }
  if (isUlid(text)) {
    return { kind: 'entity', text };
  }
  const colon = text.indexOf(':');
  const prefix = text.slice(0, colon);
  const kind = PREFIXES.find((p) => p === prefix);
  return kind !== undefined && (CHECKS[kind] as (body: string) => boolean)(text.slice(colon + 1)) ? { kind, text } : undefined;
}
