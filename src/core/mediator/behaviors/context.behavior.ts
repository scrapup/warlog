/**
 * Builds the request context (roots, clock, ids, machine, defaults) before validation.
 */
import type { OperationContextFactory } from '../operation-context.ts';
import type { OperationResult } from '../operation-result.ts';
import type { Behavior, Next, PipelineRequest } from '../pipeline.ts';

/** Attaches a fresh context to the request. */
export class ContextBehavior implements Behavior {
  /** Applies to every operation. */
  readonly appliesTo = 'both';
  /** Context factory. */
  private readonly factory: OperationContextFactory;

  /**
   * Creates the behavior.
   * @param factory - Context factory.
   */
  constructor(factory: OperationContextFactory) {
    this.factory = factory;
  }

  /**
   * Creates the context, then continues.
   * @param request - Call state.
   * @param next - Rest of the pipeline.
   * @returns The result.
   */
  async handle(request: PipelineRequest, next: Next): Promise<OperationResult | undefined> {
    request.context = await this.factory.create();
    return next();
  }
}
