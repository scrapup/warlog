/**
 * `tracker_search` (WL-10, WL-47): literal search across projects, epics, tasks and notes.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { BRANCH_FILTER, INCLUDE_ARCHIVED, PROJECT_SCOPE, limitField } from '../shared/fields.ts';
import { SEARCH_TYPES } from './search-types.ts';
import { TrackerSearchHandler } from './tracker-search.handler.ts';

/** Input schema. */
export const TRACKER_SEARCH_INPUT = z.object({
  query: z.string().trim().min(1).max(500).describe('Search keywords (literal; every word must appear)'),
  entity_types: z.array(z.enum(SEARCH_TYPES)).min(1).optional().describe('Entity types to search (default: all)'),
  project_id: PROJECT_SCOPE,
  include_archived: INCLUDE_ARCHIVED,
  branch: BRANCH_FILTER,
  limit: limitField(20),
});

/** Parsed input. */
export type TrackerSearchInput = z.infer<typeof TRACKER_SEARCH_INPUT>;

/**
 * Builds the definition.
 * @returns The `tracker_search` operation.
 */
export function trackerSearchOperation(): OperationDefinition {
  return {
    name: 'tracker_search',
    group: 'tracker',
    action: 'search',
    kind: 'query',
    input: TRACKER_SEARCH_INPUT,
    description: 'Search projects, epics, tasks and notes by name/title and description/content. Matching is literal and case-insensitive: every word must appear.',
    examples: [{ query: 'card token', entity_types: ['task', 'note'] }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TrackerSearchHandler(),
  };
}
