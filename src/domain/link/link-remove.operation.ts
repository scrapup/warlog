/**
 * `link_remove` (WL-21): removes a link.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { LinkRemoveHandler } from './link-remove.handler.ts';
import { LINK_REL, LINK_TARGET } from './link.schema.ts';

/** Input schema. */
export const LINK_REMOVE_INPUT = z.object({
  id: idField('Entity the link starts from'),
  rel: LINK_REL,
  target: LINK_TARGET,
});

/** Parsed input. */
export type LinkRemoveInput = z.infer<typeof LINK_REMOVE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `link_remove` operation.
 */
export function linkRemoveOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'link_remove',
    group: 'link',
    action: 'remove',
    kind: 'command',
    input: LINK_REMOVE_INPUT,
    description: 'Remove one link (relation and target) from an entity.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', rel: 'implements', target: 'spec:docs/specs/warlog/spec.md#wl-21' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new LinkRemoveHandler(writers),
  };
}
