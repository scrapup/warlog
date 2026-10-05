/**
 * `project_update` (WL-10): changes name, description, status or tags; `status: archived` is the
 * project's soft archive.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, PROJECT_STATUSES, TAGS, TITLE, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { ProjectUpdateHandler } from './project-update.handler.ts';

/** Input schema. */
export const PROJECT_UPDATE_INPUT = z.object({
  id: idField('Project ID'),
  name: TITLE.optional().describe('Project name'),
  description: DESCRIPTION.describe('Project description'),
  status: z.enum(PROJECT_STATUSES).optional().describe('Project status (archived = soft archive)'),
  tags: TAGS,
});

/** Parsed input. */
export type ProjectUpdateInput = z.infer<typeof PROJECT_UPDATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `project_update` operation.
 */
export function projectUpdateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'project_update',
    group: 'project',
    action: 'update',
    kind: 'command',
    input: PROJECT_UPDATE_INPUT,
    description: 'Update a project. Set status to archived to archive it.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C1', status: 'completed' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new ProjectUpdateHandler(writers),
  };
}
