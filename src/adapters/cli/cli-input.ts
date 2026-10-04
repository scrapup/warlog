/**
 * Command-line input assembly (WL-36): file < `--json-input` < flags, then output options.
 * Validation issues on fields that came from the file are located as `file:line:col field: message`.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { convertFlagValue } from './flag-mapper.ts';
import type { FieldSpec } from './flag-mapper.ts';
import { parseFileInput } from './file-input-loader.ts';
import type { FileInput } from './file-input-loader.ts';

/** Reads input files for the command line. */
export interface InputReader {
  /**
   * Reads a file.
   * @param path - File path.
   * @returns Its content.
   */
  readFile(path: string): Promise<string>;
  /**
   * Reads standard input to the end.
   * @returns Its content.
   */
  readStdin(): Promise<string>;
}

/** A field flag with the attribute name the parser stores it under. */
export interface FlagBinding {
  /** Field spec. */
  readonly spec: FieldSpec;
  /** Parser attribute name. */
  readonly attribute: string;
}

/** Input assembled for one call. */
export interface CollectedInput {
  /** Arguments for the operation (input and output options). */
  readonly args: Record<string, unknown>;
  /** The input file, when one was given. */
  readonly file: FileInput | undefined;
  /** Fields set outside the file (they override it, so the file is not their source). */
  readonly overridden: ReadonlySet<string>;
}

/** A validation issue as reported by the Validation behavior. */
interface Issue {
  /** Dotted field path. */
  readonly path: string;
  /** Problem. */
  readonly message: string;
}

/**
 * Reads and parses `--file`.
 * @param source - Path, or `-` for standard input.
 * @param bodyKey - Field receiving a Markdown body.
 * @param reader - File reader.
 * @returns The file input.
 * @throws {WarlogError} `INVALID_FILE` when unreadable; `VALIDATION` when malformed.
 */
async function loadFile(source: string, bodyKey: string, reader: InputReader): Promise<FileInput> {
  let text: string;
  try {
    text = source === '-' ? await reader.readStdin() : await reader.readFile(source);
  } catch (error: unknown) {
    throw new WarlogError('INVALID_FILE', `cannot read input file ${source}`, { file: source, reason: 'unreadable' }, { cause: error });
  }
  return parseFileInput(text, source, bodyKey);
}

/**
 * Parses `--json-input`.
 * @param text - JSON text.
 * @returns The fields.
 * @throws {WarlogError} `VALIDATION` when not a JSON object.
 */
function parseJsonInput(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new WarlogError('VALIDATION', '--json-input is not valid JSON', { issues: [{ path: '', message: 'invalid JSON' }] });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new WarlogError('VALIDATION', '--json-input must be a JSON object', { issues: [{ path: '', message: 'expected an object' }] });
  }
  return value as Record<string, unknown>;
}

/**
 * Collects field flags that were given.
 * @param bindings - Field flags.
 * @param opts - Parsed options.
 * @returns Converted values by input key.
 */
function flagValues(bindings: readonly FlagBinding[], opts: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const given = bindings.filter((b) => opts[b.attribute] !== undefined);
  return Object.fromEntries(given.map((b) => [b.spec.key, convertFlagValue(b.spec, opts[b.attribute])]));
}

/**
 * Collects the output options that were given.
 * @param opts - Parsed options.
 * @returns `format` and `fields`, when present.
 */
function outputValues(opts: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const fields = opts['fields'];
  return {
    ...(opts['format'] === undefined ? {} : { format: opts['format'] }),
    ...(typeof fields === 'string' ? { fields: fields.split(',').map((f) => f.trim()) } : {}),
  };
}

/**
 * Assembles the input of one call.
 * @param bindings - Field flags of the operation.
 * @param opts - Parsed options.
 * @param reader - File reader.
 * @returns Arguments, file and overridden fields.
 * @throws {WarlogError} `INVALID_FILE` or `VALIDATION` on bad file or JSON input.
 */
export async function collectInput(bindings: readonly FlagBinding[], opts: Readonly<Record<string, unknown>>, reader: InputReader): Promise<CollectedInput> {
  const bodyKey = bindings.some((b) => b.spec.key === 'content') ? 'content' : 'description';
  const fileOpt = opts['file'];
  const file = typeof fileOpt === 'string' ? await loadFile(fileOpt, bodyKey, reader) : undefined;
  const jsonOpt = opts['jsonInput'];
  const json = typeof jsonOpt === 'string' ? parseJsonInput(jsonOpt) : {};
  const flags = flagValues(bindings, opts);
  const overridden = new Set([...Object.keys(json), ...Object.keys(flags)]);
  return { args: { ...file?.data, ...json, ...flags, ...outputValues(opts) }, file, overridden };
}

/**
 * Tells whether a value is a list of validation issues.
 * @param value - Error detail.
 * @returns `true` for an array of `{ path, message }`.
 */
function isIssueList(value: unknown): value is Issue[] {
  return Array.isArray(value) && value.every((i: unknown) => typeof (i as Partial<Issue>)?.path === 'string');
}

/**
 * Converts a dotted path to node keys (numeric segments become indexes).
 * @param path - Dotted path.
 * @returns Path segments.
 */
function segments(path: string): (string | number)[] {
  return path.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

/**
 * Adds `file:line:col field: message` locations to a validation error on file fields.
 * @param error - Error of the call.
 * @param input - Collected input.
 * @returns The error, with `locations` added when any issue comes from the file.
 */
export function locateIssues(error: WarlogError, input: CollectedInput): WarlogError {
  const issues = error.details?.['issues'];
  const file = input.file;
  if (error.code !== 'VALIDATION' || file === undefined || !isIssueList(issues)) {
    return error;
  }
  const locations = issues.flatMap((issue) => {
    const top = issue.path.split('.')[0] ?? '';
    const pos = input.overridden.has(top) ? undefined : (file.locate(segments(issue.path)) ?? file.locate([top]));
    return pos === undefined ? [] : [`${file.source}:${pos.line}:${pos.col} ${issue.path}: ${issue.message}`];
  });
  return locations.length === 0 ? error : new WarlogError(error.code, error.message, { ...error.details, locations }, { cause: error });
}
