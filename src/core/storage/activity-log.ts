/**
 * Append-only, per-machine activity log (WL-04, WL-18, plan §3.6):
 * `<root>/activity/<machine-id>/<yyyy-mm-dd>.jsonl`. Two machines never write the same file.
 */
import type { Clock } from '../ports/clock.port.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { Logger } from '../ports/logger.port.ts';
import type { MachineIdProvider } from '../ports/machine-id.port.ts';
import type { PathGuard } from '../security/path-guard.ts';

/** Actions recorded in the activity log. */
export type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'restored'
  | 'status_changed'
  | 'recalled'
  | 'command_observed'
  | 'doc_imported'
  | 'doc_exported';

/** Caller-provided part of an activity record. */
export interface ActivityInput {
  /** Action performed. */
  readonly action: ActivityAction;
  /** Entity type. */
  readonly entity_type: string;
  /** Entity id. */
  readonly entity_id: string;
  /** Owning project, when any. */
  readonly project_id?: string;
  /** Repository key, when any. */
  readonly repo_key?: string;
  /** Short summary (no user content beyond titles). */
  readonly summary: string;
  /** Whether the change used `force`. */
  readonly forced?: boolean;
  /** Extra fields for specific actions (e.g. `command_observed`). */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Collaborators of {@link ActivityLog}. */
export interface ActivityLogDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Clock (timestamps and day files). */
  readonly clock: Clock;
  /** Machine id. */
  readonly machine: MachineIdProvider;
  /** Path guard. */
  readonly guard: PathGuard;
  /** Logger (append failures). */
  readonly logger: Logger;
}

/** Warning returned when an activity record could not be written. */
export const ACTIVITY_NOT_RECORDED = 'activity.not_recorded';

/** Writes activity records. */
export class ActivityLog {
  /** Collaborators. */
  private readonly deps: ActivityLogDeps;

  /**
   * Creates the log.
   * @param deps - Collaborators.
   */
  constructor(deps: ActivityLogDeps) {
    this.deps = deps;
  }

  /**
   * Appends one record to the machine's file of the day. A failure never fails the operation:
   * it is logged and reported as a warning (plan §5.1).
   * @param root - Scope root (global or repository).
   * @param input - Record fields.
   * @returns `undefined` when written, or {@link ACTIVITY_NOT_RECORDED}.
   */
  async append(root: string, input: ActivityInput): Promise<string | undefined> {
    const now = this.deps.clock.now();
    try {
      const machine = await this.deps.machine.get();
      const path = await this.deps.guard.resolveInside(root, 'activity', machine, `${now.toISOString().slice(0, 10)}.jsonl`);
      const { extra, ...fields } = input;
      await this.deps.fs.appendFile(path, `${JSON.stringify({ ts: now.toISOString(), machine, ...fields, ...extra })}\n`);
      return undefined;
    } catch (error: unknown) {
      this.deps.logger.log('warn', 'activity.append_failed', { action: input.action, entity_type: input.entity_type, error: String(error) });
      return ACTIVITY_NOT_RECORDED;
    }
  }
}
