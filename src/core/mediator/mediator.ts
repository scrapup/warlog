/**
 * The mediator (plan §2.2): runs every operation through the same behavior pipeline, whatever
 * the transport (WL-35).
 */
import { WarlogError } from '../errors/warlog-error.ts';
import type { OperationRegistry } from './operation-registry.ts';
import type { OperationResult } from './operation-result.ts';
import type { Behavior, Next, PipelineRequest } from './pipeline.ts';

/** Response of one call. */
export interface MediatorResponse {
  /** Result (absent on a dry run). */
  readonly result: OperationResult | undefined;
  /** Warning codes collected during the call. */
  readonly warnings: readonly string[];
}

/** Options of one call. */
export interface SendOptions {
  /** Validate only (Context, Validation, SecretGuard); nothing is written. */
  readonly dryRun?: boolean;
}

/** Dispatches operations through the behaviors, outermost first. */
export class Mediator {
  /** Operation catalog. */
  private readonly registry: OperationRegistry;
  /** Behaviors in pipeline order (outermost first). */
  private readonly behaviors: readonly Behavior[];

  /**
   * Creates the mediator.
   * @param registry - Operation catalog.
   * @param behaviors - Pipeline behaviors, outermost first.
   */
  constructor(registry: OperationRegistry, behaviors: readonly Behavior[]) {
    this.registry = registry;
    this.behaviors = behaviors;
  }

  /**
   * Runs an operation.
   * @param name - Operation name.
   * @param raw - Raw input.
   * @param options - Call options.
   * @returns Result and warnings.
   * @throws {WarlogError} Any stable error category (unexpected errors become `INTERNAL`).
   */
  async send(name: string, raw: unknown, options: SendOptions = {}): Promise<MediatorResponse> {
    const definition = this.registry.get(name);
    const request: PipelineRequest = { definition, raw, dryRun: options.dryRun === true };
    const chain = this.behaviors.filter((b) => b.appliesTo === 'both' || b.appliesTo === definition.kind);
    /**
     * Innermost step: the handler, skipped on a dry run.
     * @returns The handler result, or `undefined` on a dry run.
     */
    const terminal: Next = async () => (request.dryRun ? undefined : this.runHandler(request));
    const run = chain.reduceRight<Next>((next, behavior) => () => behavior.handle(request, next), terminal);
    const result = await run();
    return { result, warnings: [...new Set(request.context?.warnings ?? [])] };
  }

  /**
   * Calls the handler once input and context exist.
   * @param request - Call state.
   * @returns The handler result.
   * @throws {WarlogError} `INTERNAL` when the pipeline did not provide input or context.
   */
  private async runHandler(request: PipelineRequest): Promise<OperationResult> {
    if (request.context === undefined || request.input === undefined) {
      throw new WarlogError('INTERNAL', 'pipeline misconfigured: missing context or input');
    }
    return request.definition.handler.handle(request.input, request.context);
  }
}
