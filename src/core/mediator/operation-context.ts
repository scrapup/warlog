/**
 * Per-request context handed to handlers (plan §4.1): roots, clock, ids, machine, defaults and
 * the collectors of activity records and warnings.
 */
import type { WarlogError } from '../errors/warlog-error.ts';
import type { IndexSource } from '../index/index-source.ts';
import type { Clock } from '../ports/clock.port.ts';
import type { IdGenerator } from '../ports/id-generator.port.ts';
import type { MachineIdProvider } from '../ports/machine-id.port.ts';
import type { ActivityInput } from '../storage/activity-log.ts';
import type { StoreRoots } from '../storage/store-roots.ts';

/** An activity record to append to a scope root once the command succeeds. */
export interface PendingActivity {
  /** Scope root receiving the record. */
  readonly root: string;
  /** Record fields. */
  readonly input: ActivityInput;
}

/** Context of one operation call. */
export interface OperationContext {
  /** Store roots of the session. */
  readonly roots: StoreRoots;
  /** Clock. */
  readonly clock: Clock;
  /** Identifier generator. */
  readonly ids: IdGenerator;
  /** Machine id. */
  readonly machine: MachineIdProvider;
  /** Default project (`WARLOG_PROJECT`). */
  readonly defaultProject: string | undefined;
  /** Resolves `branch: "current"` to the active git branch. */
  readonly currentBranch: () => Promise<string | undefined>;
  /** The view of the store (full or point access, plan §3.7). */
  readonly index: IndexSource;
  /** Activity records appended by the Activity behavior after success (commands only). */
  readonly activity: PendingActivity[];
  /** Warning codes returned with the response. */
  readonly warnings: string[];
}

/** Builds a fresh context for each call. */
export interface OperationContextFactory {
  /**
   * Creates the context of one call.
   * @returns The context.
   * @throws {WarlogError} When the store roots cannot be resolved.
   */
  create(): Promise<OperationContext>;
}
