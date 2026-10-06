/**
 * `tracker_next` (WL-10, WL-13): the task to work on next, respecting dependencies.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { BRANCH_FILTER, PROJECT_SCOPE } from '../shared/fields.ts';
import { TrackerNextHandler } from './tracker-next.handler.ts';

/** Input schema. */
export const TRACKER_NEXT_INPUT = z.object({
  project_id: PROJECT_SCOPE,
  assigned_to: z.string().max(200).optional().describe('Only tasks of this assignee'),
  branch: BRANCH_FILTER,
});

/** Parsed input. */
export type TrackerNextInput = z.infer<typeof TRACKER_NEXT_INPUT>;

/**
 * Builds the definition.
 * @returns The `tracker_next` operation.
 */
export function trackerNextOperation(): OperationDefinition {
  return {
    name: 'tracker_next',
    group: 'tracker',
    action: 'next',
    kind: 'query',
    input: TRACKER_NEXT_INPUT,
    description:
      'Recommend the task to work on next: never one with unfinished dependencies; started work first, then overdue, active epic, priority and manual order. Returns the reason, the next subtask, alternatives and what is blocked.',
    examples: [{ branch: 'current' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TrackerNextHandler(),
  };
}
