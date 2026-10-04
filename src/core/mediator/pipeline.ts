/**
 * Pipeline types shared by the mediator and its behaviors (plan §2.2).
 */
import type { OperationContext } from './operation-context.ts';
import type { OperationDefinition, OperationKind } from './operation-definition.ts';
import type { OperationResult } from './operation-result.ts';

/** State of one call travelling through the behaviors. */
export interface PipelineRequest {
  /** Operation being called. */
  readonly definition: OperationDefinition;
  /** Raw input from the transport. */
  readonly raw: unknown;
  /** Validated input (set by the Validation behavior). */
  input?: Record<string, unknown>;
  /** Request context (set by the Context behavior). */
  context?: OperationContext;
  /** Validate only: skip the handler and the activity (CLI `--validate`). */
  readonly dryRun: boolean;
}

/** Continues the pipeline. */
export type Next = () => Promise<OperationResult | undefined>;

/** One cross-cutting concern of the pipeline. */
export interface Behavior {
  /** Which operation kinds the behavior applies to. */
  readonly appliesTo: OperationKind | 'both';
  /**
   * Runs the behavior.
   * @param request - Call state.
   * @param next - Rest of the pipeline.
   * @returns The result (`undefined` on a dry run).
   */
  handle(request: PipelineRequest, next: Next): Promise<OperationResult | undefined>;
}
