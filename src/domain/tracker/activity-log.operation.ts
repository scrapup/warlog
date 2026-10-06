/**
 * `activity_log` (WL-10): the activity records, newest first.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { PROJECT_SCOPE, idField, limitField } from '../shared/fields.ts';
import { ActivityLogHandler } from './activity-log.handler.ts';
import { ISO_INSTANT } from './tracker-fields.ts';

/** Input schema. */
export const ACTIVITY_LOG_INPUT = z.object({
  entity_type: z.enum(['project', 'epic', 'task', 'subtask', 'note']).optional().describe('Filter by entity type'),
  entity_id: idField('Filter by specific entity').optional(),
  project_id: PROJECT_SCOPE,
  action: z.enum(['created', 'updated', 'deleted', 'status_changed']).optional().describe('Filter by action type'),
  since: ISO_INSTANT.optional().describe('ISO 8601 datetime - show only activity after this time'),
  limit: limitField(50),
});

/** Parsed input. */
export type ActivityLogInput = z.infer<typeof ACTIVITY_LOG_INPUT>;

/**
 * Builds the definition.
 * @param fs - File system (activity files).
 * @returns The `activity_log` operation.
 */
export function activityLogOperation(fs: FileSystem): OperationDefinition {
  return {
    name: 'activity_log',
    group: 'activity',
    action: 'log',
    kind: 'query',
    input: ACTIVITY_LOG_INPUT,
    description: 'Activity records of every machine (who changed what, when), newest first, with optional filters.',
    examples: [{ entity_type: 'task', action: 'status_changed', limit: 20 }],
    defaultFormat: 'table',
    load: 'full',
    handler: new ActivityLogHandler(fs),
  };
}
