/**
 * Loads operation input from a file (WL-36): `.yaml`/`.yml`/`.json`, or `.md` whose front
 * matter holds the fields and whose body becomes `description` (or `content`). Every error
 * carries file, line and column; nothing is written before the input validates.
 */
import { LineCounter, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';
import { MAX_ALIAS_COUNT } from '../../core/storage/yaml-codec.ts';

/** A position in the input file (1-based). */
export interface FilePosition {
  /** Line. */
  readonly line: number;
  /** Column. */
  readonly col: number;
}

/** Input read from a file. */
export interface FileInput {
  /** Name shown in errors (`-` for standard input). */
  readonly source: string;
  /** Fields. */
  readonly data: Record<string, unknown>;
  /**
   * Locates a field in the file.
   * @param path - Field path.
   * @returns Its position, when found.
   */
  locate(path: readonly (string | number)[]): FilePosition | undefined;
}

/** A parsed YAML document with its line counter and line offset. */
interface ParsedYaml {
  /** Document. */
  readonly doc: Document;
  /** Line counter. */
  readonly counter: LineCounter;
  /** Lines before the YAML block (front matter of a Markdown file). */
  readonly offset: number;
}

/**
 * Parses YAML (JSON is valid YAML), failing with the error position.
 * @param text - YAML text.
 * @param source - File name.
 * @param offset - Lines before the text in the file.
 * @returns The parsed document.
 * @throws {WarlogError} `VALIDATION` with `file`, `line`, `col`.
 */
function parseAt(text: string, source: string, offset: number): ParsedYaml {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, version: '1.2', schema: 'core', uniqueKeys: true, prettyErrors: true });
  const error = doc.errors[0] ?? doc.warnings[0];
  if (error !== undefined) {
    const pos = error.linePos?.[0] ?? { line: 1, col: 1 };
    const line = pos.line + offset;
    throw new WarlogError('VALIDATION', `${source}:${line}:${pos.col} ${error.code}`, { file: source, line, col: pos.col });
  }
  return { doc, counter, offset };
}

/** A Markdown file split into its parts. */
interface MarkdownParts {
  /** Front matter YAML. */
  readonly yaml: string;
  /** Body after the front matter. */
  readonly body: string;
}

/** A YAML node with its source range. */
interface RangedNode {
  /** Start, value end and node end offsets. */
  readonly range?: [number, number, number];
}

/**
 * Splits a Markdown file into front matter and body.
 * @param text - File content.
 * @param source - File name.
 * @returns YAML text and body.
 * @throws {WarlogError} `VALIDATION` when the front matter is missing or unclosed.
 */
function splitMarkdown(text: string, source: string): MarkdownParts {
  const content = (text.startsWith('\uFEFF') ? text.slice(1) : text).split('\r\n').join('\n');
  const end = content.startsWith('---\n') ? content.indexOf('\n---', 3) : -1;
  if (end < 0) {
    throw new WarlogError('VALIDATION', `${source}:1:1 missing front matter`, { file: source, line: 1, col: 1 });
  }
  const after = content.indexOf('\n', end + 4);
  return { yaml: content.slice(4, end + 1), body: after < 0 ? '' : content.slice(after + 1) };
}

/**
 * Converts a parsed document to plain values; an alias bomb is an input error, not a failure.
 * Documents with parse errors or warnings were already rejected by {@link parseAt}, so `toJS`
 * only throws here when the aliases expand beyond {@link MAX_ALIAS_COUNT}.
 * @param parsed - Parsed YAML.
 * @param source - File name.
 * @returns The plain value (`{}` for an empty document).
 * @throws {WarlogError} `VALIDATION` when the aliases expand beyond the limit.
 */
function toPlain(parsed: ParsedYaml, source: string): unknown {
  try {
    return parsed.doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT }) ?? {};
  } catch (error: unknown) {
    throw new WarlogError('VALIDATION', `${source}:1:1 too many YAML aliases`, { file: source, line: 1, col: 1 }, { cause: error });
  }
}

/**
 * Builds the file input from a parsed document.
 * @param parsed - Parsed YAML.
 * @param source - File name.
 * @param extra - Fields added outside the YAML (Markdown body).
 * @returns The file input.
 * @throws {WarlogError} `VALIDATION` when the document is not a mapping.
 */
function toFileInput(parsed: ParsedYaml, source: string, extra: Record<string, unknown>): FileInput {
  const data = toPlain(parsed, source);
  if (!isPlainRecord(data)) {
    throw new WarlogError('VALIDATION', `${source}:1:1 the file must contain a mapping of fields`, { file: source, line: 1, col: 1 });
  }
  return {
    source,
    data: { ...data, ...extra },
    locate: (path) => {
      const node = parsed.doc.getIn(path, true) as RangedNode | undefined;
      const offset = node?.range?.[0];
      if (offset === undefined) {
        return undefined;
      }
      const pos = parsed.counter.linePos(offset);
      return { line: pos.line + parsed.offset, col: pos.col };
    },
  };
}

/**
 * Parses file content by extension.
 * @param text - File content.
 * @param source - File name (extension decides the format; `-` is YAML/JSON).
 * @param bodyKey - Field receiving a Markdown body (`description` or `content`).
 * @returns The file input.
 * @throws {WarlogError} `VALIDATION` with file, line and column on malformed content.
 */
export function parseFileInput(text: string, source: string, bodyKey: string): FileInput {
  if (source.toLowerCase().endsWith('.md')) {
    const { yaml, body } = splitMarkdown(text, source);
    return toFileInput(parseAt(yaml, source, 1), source, body === '' ? {} : { [bodyKey]: body });
  }
  return toFileInput(parseAt(text, source, 0), source, {});
}
