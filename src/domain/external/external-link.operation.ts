/**
 * `external_link` (WL-23, WL-24): records a reference to an item of the User's tracker.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { ExternalLinkHandler } from './external-link.handler.ts';
import { EXTERNAL_KEY, EXTERNAL_SYSTEM, EXTERNAL_URL } from './external.schema.ts';

/** Input schema. */
export const EXTERNAL_LINK_INPUT = z.object({
  id: idField('Epic, story or task'),
  system: EXTERNAL_SYSTEM,
  key: EXTERNAL_KEY,
  url: EXTERNAL_URL,
});

/** Parsed input. */
export type ExternalLinkInput = z.infer<typeof EXTERNAL_LINK_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `external_link` operation.
 */
export function externalLinkOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'external_link',
    group: 'external',
    action: 'link',
    kind: 'command',
    input: EXTERNAL_LINK_INPUT,
    description:
      'Reference an item of your task tracker (Jira, ClickUp, …) from an epic, story or task: system, key and optional https URL. warlog only stores the reference — it never contacts the tracker or synchronizes status. A key belongs to one item; find_by_external looks it up.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0C4', system: 'jira', key: 'SQ-1234', url: 'https://example.atlassian.net/browse/SQ-1234' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new ExternalLinkHandler(writers),
  };
}
