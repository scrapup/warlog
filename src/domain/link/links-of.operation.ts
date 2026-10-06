/**
 * `links_of` (WL-21): the links of an entity, outgoing and incoming.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { LinksOfHandler } from './links-of.handler.ts';
import { LINK_TARGET } from './link.schema.ts';

/** Input schema. */
export const LINKS_OF_INPUT = z.object({
  id: LINK_TARGET.describe('Entity ID, or an external reference (git:<sha>, spec:…, test:…, file:…, url:…) to find what links to it'),
  direction: z.enum(['out', 'in', 'both']).default('both').describe('out: links the entity holds; in: links pointing to it (backlinks); both (default)'),
});

/** Parsed input. */
export type LinksOfInput = z.infer<typeof LINKS_OF_INPUT>;

/**
 * Builds the definition.
 * @returns The `links_of` operation.
 */
export function linksOfOperation(): OperationDefinition {
  return {
    name: 'links_of',
    group: 'link',
    action: 'of',
    kind: 'query',
    input: LINKS_OF_INPUT,
    description: 'List the links of an entity in both directions (what it links to, and what links to it), or what links to an external reference such as a commit.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', direction: 'both' }],
    defaultFormat: 'table',
    load: 'full',
    positional: 'id',
    handler: new LinksOfHandler(),
  };
}
