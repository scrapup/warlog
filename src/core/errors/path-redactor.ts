/**
 * Replaces local absolute paths (home directory, store roots) by placeholders in error messages
 * and details before they leave the process (CLI output, MCP responses): they would expose the
 * user's account name to logs and to the agent's model provider.
 */
import { WarlogError } from './warlog-error.ts';

/** A path prefix and its placeholder, e.g. `['/home/alice', '~']`. */
export type Redaction = readonly [prefix: string, placeholder: string];

/**
 * Replaces every redacted prefix in a text (longest prefixes first).
 * @param text - Text.
 * @param redactions - Prefixes and placeholders.
 * @returns The redacted text.
 */
export function redactText(text: string, redactions: readonly Redaction[]): string {
  const ordered = [...redactions].filter(([p]) => p !== '').sort((a, b) => b[0].length - a[0].length);
  return ordered.reduce((acc, [prefix, placeholder]) => acc.split(prefix).join(placeholder), text);
}

/**
 * Redacts every string of a value.
 * @param value - JSON-like value.
 * @param redactions - Prefixes and placeholders.
 * @returns A redacted copy.
 */
export function redactValue(value: unknown, redactions: readonly Redaction[]): unknown {
  if (typeof value === 'string') {
    return redactText(value, redactions);
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, redactions));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v, redactions)]));
  }
  return value;
}

/**
 * Returns a copy of a {@link WarlogError} with redacted message and details.
 * @param error - Error.
 * @param redactions - Prefixes and placeholders.
 * @returns The redacted error (same code, cause preserved).
 */
export function redactError(error: WarlogError, redactions: readonly Redaction[]): WarlogError {
  const details = error.details === undefined ? undefined : (redactValue(error.details, redactions) as Record<string, unknown>);
  return new WarlogError(error.code, redactText(error.message, redactions), details, { cause: error.cause });
}
