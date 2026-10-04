/**
 * Rejects command input containing a known secret format before anything is written (WL-09).
 */
import type { WarlogError } from '../../errors/warlog-error.ts';
import type { SecretGuard } from '../../security/secret-guard.ts';
import type { OperationResult } from '../operation-result.ts';
import type { Behavior, Next, PipelineRequest } from '../pipeline.ts';

/** Scans every string leaf of command input. */
export class SecretGuardBehavior implements Behavior {
  /** Commands only. */
  readonly appliesTo = 'command';
  /** Secret guard. */
  private readonly guard: SecretGuard;

  /**
   * Creates the behavior.
   * @param guard - Secret guard.
   */
  constructor(guard: SecretGuard) {
    this.guard = guard;
  }

  /**
   * Scans, then continues.
   * @param request - Call state.
   * @param next - Rest of the pipeline.
   * @returns The result.
   * @throws {WarlogError} `SECRET_REJECTED` (locations only, never the secret).
   */
  async handle(request: PipelineRequest, next: Next): Promise<OperationResult | undefined> {
    this.guard.assertClean(request.input);
    return next();
  }
}
