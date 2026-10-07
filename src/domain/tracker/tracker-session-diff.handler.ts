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
function zeroCounts(): Map<string, number> {
  return new Map(BASE_COUNTS.map((a) => [a, 0]));
}

/**
 * Adds one to the count of a key. Counters are maps because keys come from activity files that a
 * cloned repository controls: a plain object indexed by `__proto__` would write to the prototype.
 * @param counts - Counters.
 * @param key - Key to count.
 */
function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
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
    const byEntity = new Map<string, Map<string, number>>();
    for (const record of records) {
      const action = String(record['action']);
      const type = String(record['entity_type']);
      bump(summary, action);
      const row = byEntity.get(type) ?? zeroCounts();
      bump(row, action);
      byEntity.set(type, row);
    }
    const highlights = records.filter((r) => HIGHLIGHTS.has(String(r['action'])) && typeof r['summary'] === 'string').map((r) => String(r['summary']));
    return {
      kind: 'object',
      value: { since, until: context.clock.now().toISOString(), total_changes: records.length, summary: Object.fromEntries(summary), by_entity_type: Object.fromEntries([...byEntity].map(([type, row]) => [type, Object.fromEntries(row)])), highlights, activity: records.map((r) => ({ ...r })) },
    };
  }
}
