/**
 * `epic_update` (WL-10): changes an epic's fields.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, EPIC_STATUSES, PRIORITIES, TAGS, TITLE, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { EpicUpdateHandler } from './epic-update.handler.ts';

/** Input schema. */
export const EPIC_UPDATE_INPUT = z.object({
  id: idField('Epic ID'),
  name: TITLE.optional().describe('Epic name'),
  description: DESCRIPTION.describe('Epic description'),
  status: z.enum(EPIC_STATUSES).optional().describe('Epic status'),
  priority: z.enum(PRIORITIES).optional().describe('Priority'),
  sort_order: z.number().int().min(0).optional().describe('Manual position within the project; lower sorts first'),
  branch: z.string().max(255).optional().describe('Git branch ("current" = active branch, "" = none)'),
  tags: TAGS,
});

/** Parsed input. */
export type EpicUpdateInput = z.infer<typeof EPIC_UPDATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `epic_update` operation.
 */
export function epicUpdateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'epic_update',
    group: 'epic',
    action: 'update',
    kind: 'command',
    input: EPIC_UPDATE_INPUT,
    description: 'Update an epic.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C2', status: 'in_progress' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new EpicUpdateHandler(writers),
  };
}
