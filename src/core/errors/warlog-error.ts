/**
 * The single error type raised by warlog code (plan §4.5, WL-40).
 */

/** Stable error categories shared by every interface. */
export type WarlogErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'INVALID_FILE'
  | 'SECRET_REJECTED'
  | 'NO_REPO_CONTEXT'
  | 'INTERNAL';

/** Error carrying a stable code and optional structured details. */
export class WarlogError extends Error {
  /** Stable category of the error. */
  readonly code: WarlogErrorCode;
  /** Structured details (field paths, current state on conflict, …). */
  readonly details: Readonly<Record<string, unknown>> | undefined;

  /**
   * Creates the error.
   * @param code - Stable category.
   * @param message - Human-readable message (never contains secrets).
   * @param details - Optional structured details.
   * @param options - Standard error options (e.g. `cause`).
   */
  constructor(code: WarlogErrorCode, message: string, details?: Readonly<Record<string, unknown>>, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WarlogError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Tells whether a value is a {@link WarlogError} with the given code.
 * @param error - Any thrown value.
 * @param code - Expected code.
 * @returns `true` when `error` is a `WarlogError` with `code`.
 */
export function isWarlogError(error: unknown, code: WarlogErrorCode): error is WarlogError {
  return error instanceof WarlogError && error.code === code;
}

/**
 * Keeps a {@link WarlogError} as is; anything else becomes `INTERNAL` (no message leaks, cause kept).
 * @param error - Any thrown value.
 * @returns A stable error.
 */
export function toWarlogError(error: unknown): WarlogError {
  return error instanceof WarlogError ? error : new WarlogError('INTERNAL', 'internal error', undefined, { cause: error });
}
