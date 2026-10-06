/**
 * `tracker_export` (WL-10, WL-14): a project as an export of the current tracker's format.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { PROJECT_SCOPE } from '../shared/fields.ts';
import { TrackerExportHandler } from './tracker-export.handler.ts';

/** Input schema. */
export const TRACKER_EXPORT_INPUT = z.object({
  project_id: PROJECT_SCOPE,
});

/** Parsed input. */
export type TrackerExportInput = z.infer<typeof TRACKER_EXPORT_INPUT>;

/**
 * Builds the definition.
 * @returns The `tracker_export` operation.
 */
export function trackerExportOperation(): OperationDefinition {
  return {
    name: 'tracker_export',
    group: 'tracker',
    action: 'export',
    kind: 'query',
    input: TRACKER_EXPORT_INPUT,
    description:
      'Export a project (epics, stories, tasks with subtasks, comments and dependencies, notes) in the current tracker format 1.3; tracker_import reads it back. Removed tasks and notes are left out.',
    examples: [{ project_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C1' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TrackerExportHandler(),
  };
}
