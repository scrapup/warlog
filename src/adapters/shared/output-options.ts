/**
 * Output options accepted by every operation in both interfaces (WL-38): they shape the
 * rendering and never reach the handler.
 */
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { toIssues } from '../../core/mediator/behaviors/validation.behavior.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';
import type { PresentOptions } from '../../core/presenter/presenter.ts';

/** Output formats. */
export const OUTPUT_FORMATS = ['table', 'yaml', 'json'] as const;

/** Schema of the output options. */
export const OUTPUT_OPTIONS = z
  .object({
    format: z.enum(OUTPUT_FORMATS).optional().describe('Output format (default: the operation default)'),
    fields: z.array(z.string().min(1)).optional().describe('Fields to keep in the output'),
  })
  .strict();

/** Names of the output options. */
export const OUTPUT_OPTION_KEYS: readonly string[] = Object.keys(OUTPUT_OPTIONS.shape);

/** Raw input split into operation input and output options. */
export interface SplitInput {
  /** Operation input. */
  readonly input: Record<string, unknown>;
  /** Output options. */
  readonly output: PresentOptions;
}

/**
 * Splits transport arguments into operation input and output options.
 * @param args - Raw arguments.
 * @returns Input and validated output options.
 * @throws {WarlogError} `VALIDATION` when the arguments are not an object or the output options are invalid.
 */
export function splitOutputOptions(args: unknown): SplitInput {
  if (args !== undefined && !isPlainRecord(args)) {
    throw new WarlogError('VALIDATION', 'arguments must be an object', { issues: [{ path: '', message: 'expected an object' }] });
  }
  const entries = Object.entries(args ?? {});
  const input = Object.fromEntries(entries.filter(([k]) => !OUTPUT_OPTION_KEYS.includes(k)));
  const parsed = OUTPUT_OPTIONS.safeParse(Object.fromEntries(entries.filter(([k]) => OUTPUT_OPTION_KEYS.includes(k))));
  if (!parsed.success) {
    throw new WarlogError('VALIDATION', 'invalid output options', { issues: toIssues(parsed.error) });
  }
  const output: PresentOptions = {
    ...(parsed.data.format === undefined ? {} : { format: parsed.data.format }),
    ...(parsed.data.fields === undefined ? {} : { fields: parsed.data.fields }),
  };
  return { input, output };
}
