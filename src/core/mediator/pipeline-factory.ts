/**
 * The behavior pipeline in its fixed order (plan §2.2): ErrorMapping → Context → Validation →
 * SecretGuard → Activity → handler. Composition roots and tests build it here, so the order is
 * defined once.
 */
import type { Redaction } from '../errors/path-redactor.ts';
import type { Logger } from '../ports/logger.port.ts';
import type { SecretGuard } from '../security/secret-guard.ts';
import type { ActivityLog } from '../storage/activity-log.ts';
import { ActivityBehavior } from './behaviors/activity.behavior.ts';
import { ContextBehavior } from './behaviors/context.behavior.ts';
import { ErrorMappingBehavior } from './behaviors/error-mapping.behavior.ts';
import { SecretGuardBehavior } from './behaviors/secret-guard.behavior.ts';
import { ValidationBehavior } from './behaviors/validation.behavior.ts';
import type { OperationContextFactory } from './operation-context.ts';
import type { Behavior } from './pipeline.ts';

/** Collaborators of the pipeline. */
export interface PipelineDeps {
  /** Logger (codes only). */
  readonly logger: Logger;
  /** Static path redactions (the home directory); store roots are added per call. */
  readonly redactions: readonly Redaction[];
  /** Context factory. */
  readonly contexts: OperationContextFactory;
  /** Secret detector. */
  readonly secretGuard: SecretGuard;
  /** Activity log. */
  readonly activity: ActivityLog;
}

/**
 * Builds the behaviors, outermost first.
 * @param deps - Collaborators.
 * @returns The ordered behaviors.
 */
export function buildPipeline(deps: PipelineDeps): Behavior[] {
  return [
    new ErrorMappingBehavior(deps.logger, deps.redactions),
    new ContextBehavior(deps.contexts),
    new ValidationBehavior(),
    new SecretGuardBehavior(deps.secretGuard),
    new ActivityBehavior(deps.activity),
  ];
}
