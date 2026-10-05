/**
 * Lists activity records, newest first.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { resolveProjectScope } from '../shared/lookup.ts';
import type { ActivityLogInput } from './activity-log.operation.ts';
import { activityOf, isoInstant } from './activity-source.ts';

/** Handles `activity_log`. */
export class ActivityLogHandler implements OperationHandler<ActivityLogInput> {
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
   * Lists the records.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for an unknown project scope.
   */
  async handle(input: ActivityLogInput, context: OperationContext): Promise<OperationResult> {
    const projectId = resolveProjectScope(context, await context.index.full(), input.project_id);
    const { records } = await activityOf(this.fs, context, input.since === undefined ? undefined : isoInstant(input.since));
    const wanted: [unknown, string][] = [
      [input.entity_type, 'entity_type'],
      [input.entity_id, 'entity_id'],
      [input.action, 'action'],
      [projectId, 'project_id'],
    ];
    const rows = records
      .filter((r) => wanted.every(([value, field]) => value === undefined || r[field] === value))
      .filter((r) => input.since === undefined || String(r['ts']) > isoInstant(input.since))
      .reverse()
      .slice(0, input.limit)
      .map((r) => ({ ...r }));
    return { kind: 'list', rows };
  }
}
