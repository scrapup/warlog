/**
 * Outermost behavior (WL-40): unexpected errors become `INTERNAL` without stack or message;
 * every error leaves with local paths redacted; failures are logged with codes only.
 */
import { errorFields } from '../../errors/error-fields.ts';
import type { Redaction } from '../../errors/path-redactor.ts';
import { redactError } from '../../errors/path-redactor.ts';
import { toWarlogError } from '../../errors/warlog-error.ts';
import type { WarlogError, WarlogErrorCode } from '../../errors/warlog-error.ts';
import type { LogLevel, Logger } from '../../ports/logger.port.ts';
import type { StoreRoots } from '../../storage/store-roots.ts';
import type { OperationResult } from '../operation-result.ts';
import type { Behavior, Next, PipelineRequest } from '../pipeline.ts';

/** Log level of a failure: unexpected errors and rejected secrets are visible by default. */
const LEVELS: Partial<Record<WarlogErrorCode, LogLevel>> = { INTERNAL: 'error', SECRET_REJECTED: 'warn' };

/**
 * Redactions for the store roots of a call (repository paths before the global root).
 * @param roots - Roots of the call, when resolved.
 * @returns Prefixes and placeholders.
 */
export function rootRedactions(roots: StoreRoots | undefined): Redaction[] {
  if (roots === undefined) {
    return [];
  }
  const repo = roots.repository;
  const repoRedactions: Redaction[] = repo === undefined ? [] : [[repo.root, '<repo-store>'], [repo.mainWorktree, '<repo>']];
  return [...repoRedactions, [roots.global, '<store>']];
}

/** Maps errors to the stable categories. */
export class ErrorMappingBehavior implements Behavior {
  /** Applies to every operation. */
  readonly appliesTo = 'both';
  /** Logger. */
  private readonly logger: Logger;
  /** Path redactions. */
  private readonly redactions: readonly Redaction[];

  /**
   * Creates the behavior.
   * @param logger - Logger (codes only).
   * @param redactions - Static local path prefixes to hide (home); the call's store roots are added.
   */
  constructor(logger: Logger, redactions: readonly Redaction[]) {
    this.logger = logger;
    this.redactions = redactions;
  }

  /**
   * Runs the rest of the pipeline and maps failures.
   * @param request - Call state.
   * @param next - Rest of the pipeline.
   * @returns The result.
   * @throws {WarlogError} The original category (redacted) or `INTERNAL`.
   */
  async handle(request: PipelineRequest, next: Next): Promise<OperationResult | undefined> {
    try {
      return await next();
    } catch (error: unknown) {
      const mapped = toWarlogError(error);
      this.logger.log(LEVELS[mapped.code] ?? 'debug', 'op.failed', { op: request.definition.name, ...errorFields(error) });
      throw redactError(mapped, [...rootRedactions(request.context?.roots), ...this.redactions]);
    }
  }
}
