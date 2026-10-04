/**
 * YAML 1.2 (core schema) codec (WL-05, WL-28): no implicit coercion of `no`, `off`, `012`,
 * `1.10`; duplicate keys rejected; alias expansion bounded (billion laughs).
 */
import { parseDocument, stringify } from 'yaml';
import { WarlogError } from '../errors/warlog-error.ts';

/** Maximum alias expansions accepted while parsing. */
export const MAX_ALIAS_COUNT = 100;

/** Location of a YAML error. */
export interface YamlErrorLocation {
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly col: number;
}

/**
 * Parses YAML text.
 * @param text - YAML document.
 * @param source - Name of the source (file path) for error details.
 * @returns The parsed value (`null` for an empty document).
 * @throws {WarlogError} `INVALID_FILE` (`reason: yaml`) with line and column.
 */
export function parseYaml(text: string, source: string): unknown {
  const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true, prettyErrors: true });
  const error = doc.errors[0] ?? doc.warnings[0];
  if (error !== undefined) {
    const location: YamlErrorLocation = error.linePos?.[0] ?? { line: 1, col: 1 };
    throw new WarlogError('INVALID_FILE', `${source}:${location.line}:${location.col} ${error.code}`, {
      reason: 'yaml',
      file: source,
      line: location.line,
      col: location.col,
    });
  }
  try {
    return doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  } catch (cause: unknown) {
    throw new WarlogError('INVALID_FILE', `${source}: excessive alias expansion`, { reason: 'yaml', file: source }, { cause });
  }
}

/**
 * Serializes a value as YAML 1.2, quoting strings that would otherwise change type.
 * @param value - Value to serialize.
 * @returns YAML text ending with a newline.
 */
export function stringifyYaml(value: unknown): string {
  return stringify(value, { version: '1.2', schema: 'core', lineWidth: 0 });
}
