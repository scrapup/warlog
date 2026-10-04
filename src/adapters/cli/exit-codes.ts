/**
 * Stable command-line exit codes (WL-39): 0 success, 1 error, 2 not found, 3 validation,
 * 4 conflict.
 */
import type { WarlogErrorCode } from '../../core/errors/warlog-error.ts';

/** Exit code of a successful call. */
export const EXIT_OK = 0;
/** Exit code of an invalid invocation or input. */
export const EXIT_VALIDATION = 3;

/**
 * Maps an error code to the process exit code.
 * @param code - Error category.
 * @returns 2 for NOT_FOUND, 3 for VALIDATION, 4 for CONFLICT, 1 otherwise.
 */
export function exitCodeFor(code: WarlogErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 2;
    case 'VALIDATION':
      return EXIT_VALIDATION;
    case 'CONFLICT':
      return 4;
    default:
      return 1;
  }
}
