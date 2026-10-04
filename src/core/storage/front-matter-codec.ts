/**
 * Markdown + YAML front matter codec (WL-05): structured fields in the front matter, free
 * text in the body. The body is preserved byte for byte; keys are written in a stable order.
 */
import { WarlogError } from '../errors/warlog-error.ts';
import { hasMergeConflictMarkers } from '../security/merge-marker-detector.ts';
import { MANAGED_FIELDS } from './entity-ref.ts';
import { parseYaml, stringifyYaml } from './yaml-codec.ts';

/** A parsed entity file. */
export interface FrontMatterDocument {
  /** Front-matter fields. */
  readonly data: Readonly<Record<string, unknown>>;
  /** Body (everything after the closing delimiter line). */
  readonly body: string;
}

/** Keys written first (the managed common fields, in order); other keys follow alphabetically. */
const LEADING_KEYS = MANAGED_FIELDS;

/** UTF-8 byte order mark. */
const BOM = '\uFEFF';

/** Offsets of the closing front-matter delimiter. */
interface ClosingDelimiter {
  /** Index where the YAML block ends (start of the `---` line). */
  readonly yamlEnd: number;
  /** Index where the body starts. */
  readonly bodyStart: number;
}

/**
 * Finds the end of the opening front-matter block.
 * @param text - File content without BOM.
 * @returns The closing delimiter offsets, or `undefined`.
 */
function findClosing(text: string): ClosingDelimiter | undefined {
  let cursor = text.indexOf('\n') + 1;
  while (cursor > 0 && cursor <= text.length) {
    const next = text.indexOf('\n', cursor);
    const lineEnd = next < 0 ? text.length : next;
    const raw = text.slice(cursor, lineEnd);
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '---') {
      return { yamlEnd: cursor, bodyStart: next < 0 ? text.length : next + 1 };
    }
    cursor = next < 0 ? -1 : next + 1;
  }
  return undefined;
}

/**
 * Parses an entity file.
 * @param text - File content (UTF-8, optional BOM, LF or CRLF).
 * @param source - File path for error details.
 * @returns Front matter and body.
 * @throws {WarlogError} `INVALID_FILE` with `reason` `merge_conflict`, `front_matter` or `yaml`.
 */
export function parseFrontMatter(text: string, source: string): FrontMatterDocument {
  const content = text.startsWith(BOM) ? text.slice(1) : text;
  if (hasMergeConflictMarkers(content)) {
    throw new WarlogError('INVALID_FILE', `${source}: merge conflict markers`, { reason: 'merge_conflict', file: source });
  }
  const opening = content.startsWith('---\n') || content.startsWith('---\r\n');
  const closing = opening ? findClosing(content) : undefined;
  if (closing === undefined) {
    throw new WarlogError('INVALID_FILE', `${source}: missing front matter`, { reason: 'front_matter', file: source });
  }
  const data = parseYaml(content.slice(content.indexOf('\n') + 1, closing.yamlEnd), source);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new WarlogError('INVALID_FILE', `${source}: front matter is not a mapping`, { reason: 'front_matter', file: source });
  }
  return { data: data as Record<string, unknown>, body: content.slice(closing.bodyStart) };
}

/**
 * Orders the keys of the front matter: {@link LEADING_KEYS} first, then alphabetically.
 * @param data - Fields.
 * @returns A new object with ordered keys (`undefined` values dropped).
 */
export function orderKeys(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const leading = LEADING_KEYS.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !LEADING_KEYS.includes(k)).sort();
  return Object.fromEntries([...leading, ...rest].map((k) => [k, data[k]]));
}

/**
 * Serializes an entity file.
 * @param doc - Front matter and body.
 * @returns File content.
 */
export function stringifyFrontMatter(doc: FrontMatterDocument): string {
  return `---\n${stringifyYaml(orderKeys(doc.data))}---\n${doc.body}`;
}
