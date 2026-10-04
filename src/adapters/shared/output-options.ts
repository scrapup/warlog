/**
 * Output options accepted by every operation in both interfaces (WL-38): they shape the
 * rendering and never reach the handler.
 */
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { PresentOptions } from '../../core/presenter/presenter.ts';

/** Schema of the output options. */
export const OUTPUT_OPTIONS = z
  .object({
    format: z.enum(['table', 'yaml', 'json']).optional().describe('Output format (default: the operation default)'),
    fields: z.array(z.string().min(1)).optional().describe('Fields to keep in the output'),
  })
  .strict();

/** Names of the output options. */
export const OUTPUT_OPTION_KEYS: readonly string[] = ['format', 'fields'];

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
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    throw new WarlogError('VALIDATION', 'arguments must be an object', { issues: [{ path: '', message: 'expected an object' }] });
  }
  const entries = Object.entries(args ?? {});
  const input = Object.fromEntries(entries.filter(([k]) => !OUTPUT_OPTION_KEYS.includes(k)));
  const parsed = OUTPUT_OPTIONS.safeParse(Object.fromEntries(entries.filter(([k]) => OUTPUT_OPTION_KEYS.includes(k))));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new WarlogError('VALIDATION', 'invalid output options', { issues });
  }
  const output: PresentOptions = {
    ...(parsed.data.format === undefined ? {} : { format: parsed.data.format }),
    ...(parsed.data.fields === undefined ? {} : { fields: parsed.data.fields }),
  };
  return { input, output };
}
