/**
 * Repository key from a remote URL (WL-02): string operations only (WL-48). Strips scheme,
 * credentials, port and `.git`, converts the scp form `host:path` to `host/path`, lower-cases
 * the host and joins segments with `__`.
 */
import { isAlnum } from '../security/char-classes.ts';

/** A URL without scheme and credentials. */
interface StrippedUrl {
  /** Remaining `host[:port]/path` or `host:path`. */
  readonly rest: string;
  /** Whether the URL used the scp form (no scheme). */
  readonly scp: boolean;
}

/** Host and path of a remote. */
interface HostPath {
  /** Lower-case host without port. */
  readonly host: string;
  /** Path after the host. */
  readonly path: string;
}

/**
 * Removes the scheme and the credentials part of a URL.
 * @param url - Remote URL.
 * @returns `host[:port]/path` or `host:path` (scp form).
 */
function stripSchemeAndUser(url: string): StrippedUrl {
  const scheme = url.indexOf('://');
  const withoutScheme = scheme >= 0 ? url.slice(scheme + 3) : url;
  const slash = withoutScheme.indexOf('/');
  const authorityEnd = slash < 0 ? withoutScheme.length : slash;
  const at = withoutScheme.lastIndexOf('@', authorityEnd);
  const rest = at >= 0 ? withoutScheme.slice(at + 1) : withoutScheme;
  return { rest, scp: scheme < 0 };
}

/**
 * Splits `rest` into host and path.
 * @param rest - URL without scheme and credentials.
 * @param scp - Whether the URL used the scp form.
 * @returns Host (lower case, without port) and path.
 */
function splitHost(rest: string, scp: boolean): HostPath {
  const slash = rest.indexOf('/');
  const colon = rest.indexOf(':');
  if (scp && colon > 0 && (slash < 0 || colon < slash)) {
    return { host: rest.slice(0, colon).toLowerCase(), path: rest.slice(colon + 1) };
  }
  const authority = slash < 0 ? rest : rest.slice(0, slash);
  const host = colon > 0 && colon < authority.length ? authority.slice(0, colon) : authority;
  return { host: host.toLowerCase(), path: slash < 0 ? '' : rest.slice(slash + 1) };
}

/**
 * Replaces characters outside `[A-Za-z0-9._-]` by `-`.
 * @param segment - Path segment.
 * @returns A safe segment.
 */
function safeSegment(segment: string): string {
  let out = '';
  for (const ch of segment) {
    out += isAlnum(ch) || ch === '.' || ch === '_' || ch === '-' ? ch : '-';
  }
  return out;
}

/**
 * Normalizes a remote URL into a repository key.
 * @param url - Remote URL (`https://…`, `ssh://…`, `git@host:path`, `file:///…`).
 * @returns The key, e.g. `github.com__scrapup__warlog`.
 */
export function normalizeRemote(url: string): string {
  const { rest, scp } = stripSchemeAndUser(url.trim());
  const { host, path } = splitHost(rest, scp);
  const trimmedPath = path.endsWith('/') ? path.slice(0, -1) : path;
  const noGit = trimmedPath.endsWith('.git') ? trimmedPath.slice(0, -4) : trimmedPath;
  const segments = [host, ...noGit.split('/')].filter((s) => s !== '' && s !== '.' && s !== '..');
  return segments.map(safeSegment).join('__');
}
