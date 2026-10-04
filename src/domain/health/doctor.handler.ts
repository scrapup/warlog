/**
 * Health report of the store (WL-45): lists what the User must resolve by hand and never repairs
 * anything. Each section is probed independently, so one failing probe does not hide the others;
 * sections whose checks arrive with later stories are reported as `not_checked` and do not count
 * towards `healthy`.
 */
import { errorFields } from '../../core/errors/error-fields.ts';
import { toWarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { Logger } from '../../core/ports/logger.port.ts';
import type { FileProblem, RootKind, StoreView } from '../../core/ports/store-view.port.ts';

/** Age after which a temporary file is reported (1 hour). */
export const STALE_TEMP_MS = 3_600_000;

/** Milliseconds in a minute. */
const MS_PER_MINUTE = 60_000;

/** Value of a section whose checks are not implemented yet. */
export const NOT_CHECKED = 'not_checked';

/** Input of `doctor` (none). */
export type DoctorInput = Record<string, never>;

/** What a probe reads. */
interface ProbeContext {
  /** Store view. */
  readonly view: StoreView;
  /** Current time (ms). */
  readonly now: number;
}

/** A section that failed to compute. */
interface FailedSection {
  /** Error category. */
  readonly error: string;
}

/** A report entry locating a file. */
interface LocatedEntry {
  /** Root holding the file. */
  readonly root: RootKind;
  /** Path relative to the root (never absolute). */
  readonly path: string;
}

/** A probe computing one section (`NOT_CHECKED` until its story lands). */
type Probe = (context: ProbeContext) => readonly unknown[] | typeof NOT_CHECKED;

/** Section value in the report. */
type Section = readonly unknown[] | typeof NOT_CHECKED | FailedSection;

/**
 * Report entry of a file.
 * @param file - File.
 * @returns `{ root, path }`.
 */
function located(file: Pick<FileProblem, 'root' | 'relative'>): LocatedEntry {
  return { root: file.root, path: file.relative };
}

/** Sections of the report, in output order. */
const PROBES: Readonly<Record<string, Probe>> = {
  conflict_copies: ({ view }) => view.excluded.conflictCopies().map(located),
  merge_conflicts: ({ view }) =>
    view.excluded
      .invalidFiles()
      .filter((p) => p.reason === 'merge_conflict')
      .map(located),
  invalid_files: ({ view }) =>
    view.excluded
      .invalidFiles()
      .filter((p) => p.reason !== 'merge_conflict')
      .map((p) => ({ ...located(p), reason: p.reason })),
  pending_links: ({ view }) => view.pendingLinks().map((l) => ({ from: l.from, rel: l.rel, target: l.target })),
  // Checked by US-102 (document references) and US-99 (memory review).
  document_references: () => NOT_CHECKED,
  memories_due_for_review: () => NOT_CHECKED,
  stale_temp_files: ({ view, now }) =>
    view.excluded
      .tempFiles()
      .map((t) => ({ file: t, ageMs: now - t.mtimeMs }))
      .filter(({ ageMs }) => ageMs > STALE_TEMP_MS)
      .map(({ file, ageMs }) => ({ ...located(file), age_minutes: Math.floor(ageMs / MS_PER_MINUTE) })),
};

/**
 * Tells whether a section is checked and clean.
 * @param section - Section value.
 * @returns `true` for an empty list or a section not checked yet.
 */
function isClean(section: Section): boolean {
  return section === NOT_CHECKED || (Array.isArray(section) && section.length === 0);
}

/** Builds the health report. */
export class DoctorHandler implements OperationHandler<DoctorInput> {
  /** Logger (codes only). */
  private readonly logger: Logger;

  /**
   * Creates the handler.
   * @param logger - Logger for failed probes.
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Reports every category of problem found in the view.
   * @param _input - No input.
   * @param context - Request context.
   * @returns An object with `healthy` and one value per section.
   */
  async handle(_input: DoctorInput, context: OperationContext): Promise<OperationResult> {
    const probeContext: ProbeContext = { view: await context.index.full(), now: context.clock.now().getTime() };
    const sections = Object.fromEntries(Object.entries(PROBES).map(([name, probe]) => [name, this.run(name, probe, probeContext)]));
    return { kind: 'object', value: { healthy: Object.values(sections).every(isClean), ...sections } };
  }

  /**
   * Runs one probe; a failure is logged with codes only and reported by category.
   * @param name - Section name.
   * @param probe - Probe.
   * @param probeContext - What the probe reads.
   * @returns The section value.
   */
  private run(name: string, probe: Probe, probeContext: ProbeContext): Section {
    try {
      return probe(probeContext);
    } catch (error: unknown) {
      this.logger.log('error', 'doctor.probe_failed', { section: name, ...errorFields(error) });
      return { error: toWarlogError(error).code };
    }
  }
}
