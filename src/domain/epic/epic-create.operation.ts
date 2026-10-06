/**
 * `epic_create` (WL-10): creates an epic in a project, optionally bound to a git branch.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, EPIC_STATUSES, PRIORITIES, TAGS, TITLE, idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { EpicCreateHandler } from './epic-create.handler.ts';

/** Input schema. */
export const EPIC_CREATE_INPUT = z.object({
  project_id: idField('Parent project ID'),
  name: TITLE.describe('Epic name'),
  description: DESCRIPTION.describe('Epic description'),
  status: z.enum(EPIC_STATUSES).default('planned').describe('Epic status'),
  priority: z.enum(PRIORITIES).default('medium').describe('Priority'),
  branch: z.string().max(255).optional().describe('Git branch this epic belongs to ("current" = active branch)'),
  tags: TAGS,
});

/** Parsed input. */
export type EpicCreateInput = z.infer<typeof EPIC_CREATE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `epic_create` operation.
 */
export function epicCreateOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'epic_create',
    group: 'epic',
    action: 'create',
    kind: 'command',
    input: EPIC_CREATE_INPUT,
    description: 'Create an epic within a project. Pass branch ("current" = active git branch) to scope it to a branch.',
    examples: [{ project_id: '01J9Z8Q4N6V2M3K5H7G8F9D0C1', name: 'Payment step', priority: 'high', branch: 'current' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new EpicCreateHandler(writers),
  };
}
