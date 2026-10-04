/**
 * Appends the activity records collected by a successful command (WL-04, WL-18). A failed
 * append never fails the command: it becomes a warning.
 */
import type { ActivityLog } from '../../storage/activity-log.ts';
import type { OperationResult } from '../operation-result.ts';
import type { Behavior, Next, PipelineRequest } from '../pipeline.ts';

/** Writes pending activity after the handler succeeded. */
export class ActivityBehavior implements Behavior {
  /** Commands only. */
  readonly appliesTo = 'command';
  /** Activity log. */
  private readonly log: ActivityLog;

  /**
   * Creates the behavior.
   * @param log - Activity log.
   */
  constructor(log: ActivityLog) {
    this.log = log;
  }

  /**
   * Runs the handler, then appends its activity.
   * @param request - Call state.
   * @param next - Rest of the pipeline.
   * @returns The result.
   */
  async handle(request: PipelineRequest, next: Next): Promise<OperationResult | undefined> {
    const result = await next();
    const context = request.context;
    if (result === undefined || context === undefined) {
      return result;
    }
    for (const pending of context.activity) {
      const warning = await this.log.append(pending.root, pending.input);
      if (warning !== undefined) {
        context.warnings.push(warning);
      }
    }
    return result;
  }
}
