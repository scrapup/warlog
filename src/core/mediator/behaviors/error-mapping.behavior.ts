/**
 * Outermost behavior (WL-40): unexpected errors become `INTERNAL` without stack or message;
 * every error leaves with local paths redacted; failures are logged with codes only.
 */
import { errorFields } from '../../errors/error-fields.ts';
import type { Redaction } from '../../errors/path-redactor.ts';
import { redactError } from '../../errors/path-redactor.ts';
import { WarlogError } from '../../errors/warlog-error.ts';
import type { Logger } from '../../ports/logger.port.ts';
import type { OperationResult } from '../operation-result.ts';
import type { Behavior, Next, PipelineRequest } from '../pipeline.ts';

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
   * @param redactions - Local path prefixes to hide (home, store roots).
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
      const mapped = error instanceof WarlogError ? error : new WarlogError('INTERNAL', 'internal error', undefined, { cause: error });
      this.logger.log(mapped.code === 'INTERNAL' ? 'error' : 'debug', 'op.failed', { op: request.definition.name, ...errorFields(error) });
      throw redactError(mapped, this.redactions);
    }
  }
}
