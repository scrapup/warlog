/**
 * Health report of the store (WL-45): lists what the User must resolve by hand and never repairs
 * anything. Each section is probed independently, so one failing probe does not hide the others.
 */
import type { FileProblem } from '../../core/index/indexed-entity.ts';
import type { StoreIndex } from '../../core/index/store-index.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';

/** Age after which a temporary file is reported (1 hour). */
export const STALE_TEMP_MS = 3_600_000;

/** Input of `doctor` (none). */
export type DoctorInput = Record<string, never>;

/** A section that failed to compute. */
interface FailedSection {
  /** Error category. */
  readonly error: string;
}

/** A probe computing one section. */
type Probe = (index: StoreIndex, now: number) => unknown[];

/** A file located by root and relative path. */
type Located = Pick<FileProblem, 'root' | 'relative'>;

/**
 * Report entry of a file (relative path only: no local absolute paths in the output).
 * @param file - File.
 * @returns `{ root, path }`.
 */
function located(file: Located): Record<string, unknown> {
  return { root: file.root, path: file.relative };
}

/** Sections of the report, in output order. */
const PROBES: Readonly<Record<string, Probe>> = {
  conflict_copies: (index) => index.excluded.conflictCopies().map(located),
  merge_conflicts: (index) =>
    index.excluded
      .invalidFiles()
      .filter((p) => p.reason === 'merge_conflict')
      .map(located),
  invalid_files: (index) =>
    index.excluded
      .invalidFiles()
      .filter((p) => p.reason !== 'merge_conflict')
      .map((p) => ({ ...located(p), reason: p.reason })),
  pending_links: (index) => index.pendingLinks().map((l) => ({ from: l.from, rel: l.rel, target: l.target })),
  // Filled by US-102 (document references) and US-99 (memory review).
  document_references: () => [],
  memories_due_for_review: () => [],
  stale_temp_files: (index, now) =>
    index.excluded
      .tempFiles()
      .filter((t) => now - t.mtimeMs > STALE_TEMP_MS)
      .map((t) => ({ ...located(t), age_minutes: Math.floor((now - t.mtimeMs) / 60_000) })),
};

/**
 * Runs one probe.
 * @param probe - Probe.
 * @param index - View.
 * @param now - Current time (ms).
 * @returns Its entries, or the failure.
 */
function run(probe: Probe, index: StoreIndex, now: number): unknown[] | FailedSection {
  try {
    return probe(index, now);
  } catch {
    return { error: 'INTERNAL' };
  }
}

/** Builds the health report. */
export class DoctorHandler implements OperationHandler<DoctorInput> {
  /**
   * Reports every category of problem found in the view.
   * @param _input - No input.
   * @param context - Request context.
   * @returns An object with one list per section and `healthy`.
   */
  async handle(_input: DoctorInput, context: OperationContext): Promise<OperationResult> {
    const index = await context.index.full();
    const now = context.clock.now().getTime();
    const sections = Object.fromEntries(Object.entries(PROBES).map(([name, probe]) => [name, run(probe, index, now)]));
    const healthy = Object.values(sections).every((s) => Array.isArray(s) && s.length === 0);
    return { kind: 'object', value: { healthy, ...sections } };
  }
}
