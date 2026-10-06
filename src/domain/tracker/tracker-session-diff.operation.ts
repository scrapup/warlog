/**
 * `tracker_session_diff` (WL-10): what changed since a moment, summarized.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { TrackerSessionDiffHandler } from './tracker-session-diff.handler.ts';
import { ISO_INSTANT } from './tracker-fields.ts';

/** Input schema. */
export const TRACKER_SESSION_DIFF_INPUT = z.object({
  since: ISO_INSTANT.describe('ISO 8601 datetime of the previous session'),
});

/** Parsed input. */
export type TrackerSessionDiffInput = z.infer<typeof TRACKER_SESSION_DIFF_INPUT>;

/**
 * Builds the definition.
 * @param fs - File system (activity files).
 * @returns The `tracker_session_diff` operation.
 */
export function trackerSessionDiffOperation(fs: FileSystem): OperationDefinition {
  return {
    name: 'tracker_session_diff',
    group: 'tracker',
    action: 'session-diff',
    kind: 'query',
    input: TRACKER_SESSION_DIFF_INPUT,
    description: 'Summarize every change since a moment (all machines): counts by action and entity type, highlights and the records.',
    examples: [{ since: '2026-10-03T09:00:00Z' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TrackerSessionDiffHandler(fs),
  };
}
