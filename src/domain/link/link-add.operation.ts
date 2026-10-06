/**
 * `link_add` (WL-21, WL-44): relates an entity to another entity or to an external reference.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { LinkAddHandler } from './link-add.handler.ts';
import { LINK_REL, LINK_TARGET } from './link.schema.ts';

/** Input schema. */
export const LINK_ADD_INPUT = z.object({
  id: idField('Entity the link starts from'),
  rel: LINK_REL,
  target: LINK_TARGET,
});

/** Parsed input. */
export type LinkAddInput = z.infer<typeof LINK_ADD_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `link_add` operation.
 */
export function linkAddOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'link_add',
    group: 'link',
    action: 'add',
    kind: 'command',
    input: LINK_ADD_INPUT,
    description:
      'Link an entity to another entity (ID) or to an external reference (spec:<path>#anchor, git:<sha>, test:<path>::<name>, file:<path>:line, url:https://…) with a typed relation. Links are navigable both ways with links_of; a target ID not present yet is kept as a pending link.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', rel: 'implements', target: 'spec:docs/specs/warlog/spec.md#wl-21' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new LinkAddHandler(writers),
  };
}
