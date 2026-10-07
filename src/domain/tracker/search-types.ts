/**
 * Entity types `tracker_search` covers; kept apart from the operation and its handler, which
 * import each other's module otherwise.
 */

/** Entity types searched. */
export const SEARCH_TYPES = ['project', 'epic', 'task', 'note'] as const;
