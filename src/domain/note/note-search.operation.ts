/**
 * `note_search` (WL-10, WL-47): literal search over note titles and content.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { NOTE_TYPES, limitField } from '../shared/fields.ts';
import { NoteSearchHandler } from './note-search.handler.ts';

/** Input schema. */
export const NOTE_SEARCH_INPUT = z.object({
  query: z.string().trim().min(1).max(500).describe('Search keywords (literal; every word must appear)'),
  note_type: z.enum(NOTE_TYPES).optional().describe('Filter by note type'),
  limit: limitField(20),
});

/** Parsed input. */
export type NoteSearchInput = z.infer<typeof NOTE_SEARCH_INPUT>;

/**
 * Builds the definition.
 * @returns The `note_search` operation.
 */
export function noteSearchOperation(): OperationDefinition {
  return {
    name: 'note_search',
    group: 'note',
    action: 'search',
    kind: 'query',
    input: NOTE_SEARCH_INPUT,
    description: 'Search note titles and content. Matching is literal and case-insensitive: every word of the query must appear; nothing is treated as a pattern.',
    examples: [{ query: 'branching strategy', note_type: 'decision' }],
    defaultFormat: 'table',
    load: 'full',
    handler: new NoteSearchHandler(),
  };
}
