/**
 * Renders operation results for both transports (WL-38): lists as tables, entities as front
 * matter + body, structured values as YAML, scalars raw, everything as JSON on request.
 */
import { WarlogError } from '../errors/warlog-error.ts';
import type { DefaultFormat } from '../mediator/operation-definition.ts';
import type { OperationResult } from '../mediator/operation-result.ts';
import { stringifyFrontMatter } from '../storage/front-matter-codec.ts';
import { stringifyYaml } from '../storage/yaml-codec.ts';
import { projectFields } from './field-projector.ts';
import { formatTable } from './table-formatter.ts';

/** Output formats a caller can request. */
export type OutputFormat = 'table' | 'yaml' | 'json';

/** Rendering options. */
export interface PresentOptions {
  /** Requested format (default: the operation's). */
  readonly format?: OutputFormat;
  /** Fields to keep (default: all). */
  readonly fields?: readonly string[];
}

/**
 * Projects a result on the requested fields.
 * @param result - Result.
 * @param fields - Fields.
 * @returns The projected result.
 */
function project(result: OperationResult, fields: readonly string[]): OperationResult {
  switch (result.kind) {
    case 'list':
      return { ...result, rows: projectFields(result.rows, fields) };
    case 'entity': {
      const [data = {}] = projectFields([{ ...result.record.data, body: result.record.body }], fields);
      const { body, ...rest } = data;
      return { kind: 'entity', record: { data: rest, body: fields.length === 0 || 'body' in data ? String(body) : '' } };
    }
    case 'object':
      return { kind: 'object', value: projectFields([result.value], fields)[0] ?? {} };
    default:
      return result;
  }
}

/**
 * JSON form of a result.
 * @param result - Result.
 * @returns JSON-compatible value.
 */
function toJsonValue(result: OperationResult): unknown {
  switch (result.kind) {
    case 'list':
      return result.nextCursor === undefined ? { rows: result.rows } : { rows: result.rows, next_cursor: result.nextCursor };
    case 'entity':
      return { ...result.record.data, body: result.record.body };
    default:
      return result.value;
  }
}

/**
 * Raw form of a result: printed when the result offers one and the caller asked for no format
 * and no fields (WL-39).
 * @param result - Result.
 * @param options - Requested format and fields.
 * @returns The raw text, or `undefined` when the normal rendering applies.
 */
function rawText(result: OperationResult, options: PresentOptions): string | undefined {
  const plain = options.format === undefined && (options.fields ?? []).length === 0;
  return plain && result.kind === 'object' && result.raw !== undefined ? String(result.raw) : undefined;
}

/** Renders results. */
export class Presenter {
  /**
   * Renders a result.
   * @param result - Result.
   * @param defaultFormat - The operation's default format.
   * @param options - Requested format and fields.
   * @returns Text.
   * @throws {WarlogError} `VALIDATION` on an unknown field or a table requested for a non-list result.
   */
  present(result: OperationResult, defaultFormat: DefaultFormat, options: PresentOptions = {}): string {
    const raw = rawText(result, options);
    if (raw !== undefined) {
      return raw;
    }
    const projected = project(result, options.fields ?? []);
    const format = options.format ?? defaultFormat;
    if (format === 'json') {
      return JSON.stringify(toJsonValue(projected), null, 2);
    }
    if (format === 'table' && projected.kind !== 'list') {
      if (options.format === 'table') {
        throw new WarlogError('VALIDATION', 'table format applies to lists only', { field: 'format' });
      }
      return this.present(projected, 'yaml');
    }
    return this.renderText(projected);
  }

  /**
   * Text form of a projected result (table or YAML family).
   * @param result - Result.
   * @returns Text.
   */
  private renderText(result: OperationResult): string {
    switch (result.kind) {
      case 'list':
        return result.nextCursor === undefined ? formatTable(result.rows) : `${formatTable(result.rows)}\n\nnext_cursor: ${result.nextCursor}`;
      case 'entity':
        return stringifyFrontMatter(result.record);
      case 'object':
        return stringifyYaml(result.value).trimEnd();
      default:
        return result.value === null ? 'null' : String(result.value);
    }
  }
}
