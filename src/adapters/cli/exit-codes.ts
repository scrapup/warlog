/**
 * Stable command-line exit codes (WL-39): 0 success, 1 error, 2 not found, 3 validation,
 * 4 conflict.
 */
import type { WarlogErrorCode } from '../../core/errors/warlog-error.ts';

/** Exit code of a successful call. */
export const EXIT_OK = 0;
/** Exit code of any other error (`INTERNAL`, `INVALID_FILE`, `SECRET_REJECTED`, `NO_REPO_CONTEXT`). */
export const EXIT_ERROR = 1;
/** Exit code of a missing entity. */
export const EXIT_NOT_FOUND = 2;
/** Exit code of an invalid invocation or input. */
export const EXIT_VALIDATION = 3;
/** Exit code of a stale revision or an existing entity. */
export const EXIT_CONFLICT = 4;

/**
 * Maps an error code to the process exit code.
 * @param code - Error category.
 * @returns 2 for NOT_FOUND, 3 for VALIDATION, 4 for CONFLICT, 1 otherwise.
 */
export function exitCodeFor(code: WarlogErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return EXIT_NOT_FOUND;
    case 'VALIDATION':
      return EXIT_VALIDATION;
    case 'CONFLICT':
      return EXIT_CONFLICT;
    default:
      return EXIT_ERROR;
  }
}
