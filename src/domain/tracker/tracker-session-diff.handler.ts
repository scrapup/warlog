/**
 * Summarizes the activity since a moment.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { activityOf, isoInstant } from './activity-source.ts';
import type { TrackerSessionDiffInput } from './tracker-session-diff.operation.ts';

/** Actions always present in the counts. */
const BASE_COUNTS = ['created', 'updated', 'status_changed', 'deleted'] as const;

/** Actions whose summary is a highlight. */
const HIGHLIGHTS = new Set(['status_changed', 'created', 'deleted']);

/**
 * Counts of the base actions, all zero.
 * @returns A fresh counter.
 */
function zeroCounts(): Record<string, number> {
  return Object.fromEntries(BASE_COUNTS.map((a) => [a, 0]));
}

/** Handles `tracker_session_diff`. */
export class TrackerSessionDiffHandler implements OperationHandler<TrackerSessionDiffInput> {
  /** File system. */
  private readonly fs: FileSystem;

  /**
   * Creates the handler.
   * @param fs - File system.
   */
  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  /**
   * Summarizes the records at or after `since`.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ since, until, total_changes, summary, by_entity_type, highlights, activity }`.
   */
  async handle(input: TrackerSessionDiffInput, context: OperationContext): Promise<OperationResult> {
    const since = isoInstant(input.since);
    const { records } = await activityOf(this.fs, context, since);
    const summary = zeroCounts();
    const byEntity: Record<string, Record<string, number>> = {};
    for (const record of records) {
      const action = String(record['action']);
      const type = String(record['entity_type']);
      summary[action] = (summary[action] ?? 0) + 1;
      byEntity[type] ??= zeroCounts();
      byEntity[type][action] = (byEntity[type][action] ?? 0) + 1;
    }
    const highlights = records.filter((r) => HIGHLIGHTS.has(String(r['action'])) && typeof r['summary'] === 'string').map((r) => String(r['summary']));
    return {
      kind: 'object',
      value: { since, until: context.clock.now().toISOString(), total_changes: records.length, summary, by_entity_type: byEntity, highlights, activity: records.map((r) => ({ ...r })) },
    };
  }
}
