/**
 * `tracker_dashboard` (WL-10, WL-43): full project overview in one call.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { BRANCH_FILTER, INCLUDE_ARCHIVED, PROJECT_SCOPE } from '../shared/fields.ts';
import { TrackerDashboardHandler } from './tracker-dashboard.handler.ts';

/** Input schema. */
export const TRACKER_DASHBOARD_INPUT = z.object({
  include_archived: INCLUDE_ARCHIVED,
  project_id: PROJECT_SCOPE,
  branch: BRANCH_FILTER,
});

/** Parsed input. */
export type TrackerDashboardInput = z.infer<typeof TRACKER_DASHBOARD_INPUT>;

/**
 * Builds the definition.
 * @param fs - File system (activity files).
 * @returns The `tracker_dashboard` operation.
 */
export function trackerDashboardOperation(fs: FileSystem): OperationDefinition {
  return {
    name: 'tracker_dashboard',
    group: 'tracker',
    action: 'dashboard',
    kind: 'query',
    input: TRACKER_DASHBOARD_INPUT,
    description:
      'Full project overview in one call: summary, stats, epics with counts, blocked and overdue tasks, recent activity and notes, and store warnings (excluded files). Best first call when resuming work.',
    examples: [{ branch: 'current' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TrackerDashboardHandler(fs),
  };
}
