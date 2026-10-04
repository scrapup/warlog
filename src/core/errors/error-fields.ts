/**
 * Safe projection of an error for logs (plan §5.3): codes and names only, never messages or
 * paths (which may contain user names or content).
 */
import { WarlogError } from './warlog-error.ts';

/** Log fields describing an error. */
export interface ErrorFields {
  /** `WarlogError` code, or `UNEXPECTED`. */
  readonly error_code: string;
  /** Error class name, or the `typeof` of a non-error value. */
  readonly error_name: string;
  /** Node system error code (`EIO`, `EACCES`, …) when present. */
  readonly sys_code?: string;
}

/**
 * Projects an error into safe log fields.
 * @param error - Thrown value.
 * @returns Code, name and system code; no message, no path.
 */
export function errorFields(error: unknown): ErrorFields {
  const code = error instanceof WarlogError ? error.code : 'UNEXPECTED';
  const name = error instanceof Error ? error.name : typeof error;
  const sys = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return sys === undefined || error instanceof WarlogError ? { error_code: code, error_name: name } : { error_code: code, error_name: name, sys_code: sys };
}
