/**
 * Recall usage and command observations read from the activity files now (WL-18). A live index
 * does not watch `activity/`, so a long-running MCP session would miss what was recorded since
 * it started; reviews and the playbook therefore read the (small) last-90-days files per call.
 */
import { aggregateActivity } from '../../core/index/activity-aggregator.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { ActivitySummary } from '../../core/ports/store-view.port.ts';

/**
 * Reads the activity summary of the call's roots.
 * @param fs - File system.
 * @param context - Call context.
 * @returns Usage per entity and observations per command.
 */
export function freshActivity(fs: FileSystem, context: OperationContext): Promise<ActivitySummary> {
  const roots = [context.roots.global, ...(context.roots.repository === undefined ? [] : [context.roots.repository.root])];
  return aggregateActivity(fs, roots, context.clock.now());
}
