/**
 * `external_unlink` (WL-23): removes a reference to a tracker item.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { ExternalUnlinkHandler } from './external-unlink.handler.ts';
import { EXTERNAL_KEY, EXTERNAL_SYSTEM } from './external.schema.ts';

/** Input schema. */
export const EXTERNAL_UNLINK_INPUT = z.object({
  id: idField('Epic, story or task'),
  system: EXTERNAL_SYSTEM,
  key: EXTERNAL_KEY,
});

/** Parsed input. */
export type ExternalUnlinkInput = z.infer<typeof EXTERNAL_UNLINK_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `external_unlink` operation.
 */
export function externalUnlinkOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'external_unlink',
    group: 'external',
    action: 'unlink',
    kind: 'command',
    input: EXTERNAL_UNLINK_INPUT,
    description: 'Remove the reference to a tracker item from an epic, story or task.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', system: 'jira', key: 'SQ-1234' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new ExternalUnlinkHandler(writers),
  };
}
