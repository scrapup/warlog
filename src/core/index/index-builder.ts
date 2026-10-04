/**
 * Builds and maintains the view from the files of both roots (plan §3.7, WL-06, WL-43, WL-44):
 * at most {@link MAX_OPEN_FILES} files read at a time; links are never followed; bad files are
 * recorded, never thrown. When a global and a repository file carry the same id, the global one
 * wins (files are applied global root first).
 */
import { join, sep } from 'node:path';
import type { Clock } from '../ports/clock.port.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import { compareCodeUnits } from '../security/compare.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import { aggregateActivity } from './activity-aggregator.ts';
import { MAX_OPEN_FILES, mapLimit } from './bounded.ts';
import { scanDecision } from './entity-reader.ts';
import type { ReadOutcome, ScanDecision } from './entity-reader.ts';
import { loadStoreFile } from './file-loader.ts';
import type { RootKind, ScannedFile } from './indexed-entity.ts';
import { StoreIndex } from './store-index.ts';

/** Collaborators of {@link IndexBuilder}. */
export interface IndexBuilderDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Clock (activity window, build duration). */
  readonly clock: Clock;
}

/** Figures of one build. */
export interface BuildStats {
  /** Files read. */
  readonly files: number;
  /** Entities and variables in the view. */
  readonly entries: number;
  /** Files excluded as invalid. */
  readonly invalid: number;
  /** Conflict copies found. */
  readonly conflictCopies: number;
  /** Build duration in milliseconds. */
  readonly durationMs: number;
}

/** Result of a build. */
export interface BuildResult {
  /** The view. */
  readonly index: StoreIndex;
  /** Figures. */
  readonly stats: BuildStats;
}

/**
 * Log fields of a build (counts and duration only).
 * @param stats - Build figures.
 * @returns Fields.
 */
export function buildFields(stats: BuildStats): Record<string, number> {
  return { files: stats.files, entries: stats.entries, invalid: stats.invalid, conflict_copies: stats.conflictCopies, duration_ms: stats.durationMs };
}

/** A store root to scan. */
interface RootDir {
  /** Root kind. */
  readonly kind: RootKind;
  /** Absolute directory. */
  readonly dir: string;
}

/** A scanned file with its read outcome. */
interface FileResult {
  /** File. */
  readonly file: ScannedFile;
  /** Outcome of reading it. */
  readonly outcome: ReadOutcome;
}

/** A scanned file with its scan decision. */
interface Decided {
  /** File. */
  readonly file: ScannedFile;
  /** Decision. */
  readonly decision: ScanDecision;
}

/**
 * Roots of a session.
 * @param roots - Store roots.
 * @returns Global root, then the repository root when present.
 */
function rootDirs(roots: StoreRoots): RootDir[] {
  const repo = roots.repository;
  return [{ kind: 'global', dir: roots.global }, ...(repo === undefined ? [] : [{ kind: 'repo' as const, dir: repo.root }])];
}

/**
 * Applies a read outcome; a later file with an id already in the view is excluded (`duplicate_id`).
 * @param index - View.
 * @param result - File and outcome.
 */
function apply(index: StoreIndex, result: FileResult): void {
  const { file, outcome } = result;
  if (outcome.kind === 'entity' && index.isTakenByOther(outcome.entity.id, file.path)) {
    index.exclude({ ...file, reason: 'duplicate_id' }, 'invalid');
  } else if (outcome.kind === 'entity') {
    index.upsert(outcome.entity);
  } else if (outcome.kind === 'var') {
    index.upsertVar(outcome.entry);
  } else {
    index.exclude({ ...file, reason: outcome.reason }, 'invalid');
  }
}

/**
 * Finds the root of an absolute path.
 * @param dirs - Roots (the longest, i.e. nested, root wins).
 * @param path - Absolute path.
 * @returns The scanned file, or `undefined` outside every root.
 */
function locate(dirs: readonly RootDir[], path: string): ScannedFile | undefined {
  const root = [...dirs].sort((a, b) => b.dir.length - a.dir.length).find((d) => path.startsWith(`${d.dir}${sep}`));
  return root === undefined ? undefined : { root: root.kind, path, relative: path.slice(root.dir.length + 1).split(sep).join('/') };
}

/**
 * Lists the files below a directory with their decisions (skipped areas dropped), sorted by path.
 * @param fs - File system.
 * @param root - Root kind.
 * @param dir - Directory to list.
 * @param prefix - Relative path of `dir` within its root (`''` for the root itself).
 * @returns Decided files.
 */
async function listDecided(fs: FileSystem, root: RootKind, dir: string, prefix: string): Promise<Decided[]> {
  const entries = await fs.readDir(dir, { recursive: true });
  return entries
    .map((rel) => ({ root, relative: prefix === '' ? rel : `${prefix}/${rel}`, path: join(dir, ...rel.split('/')) }))
    .map((file) => ({ file, decision: scanDecision(file) }))
    .filter((d) => d.decision !== 'skip')
    .sort((a, b) => compareCodeUnits(a.file.path, b.file.path));
}

/** Builds the view and applies file changes to it. */
export class IndexBuilder {
  /** Collaborators. */
  private readonly deps: IndexBuilderDeps;

  /**
   * Creates the builder.
   * @param deps - Collaborators.
   */
  constructor(deps: IndexBuilderDeps) {
    this.deps = deps;
  }

  /**
   * Builds the view of both roots (entities and activity read in parallel).
   * @param roots - Store roots.
   * @returns The view and build figures.
   */
  async build(roots: StoreRoots): Promise<BuildResult> {
    const started = this.deps.clock.now().getTime();
    const index = new StoreIndex();
    const dirs = rootDirs(roots);
    const decided = (await Promise.all(dirs.map((root) => listDecided(this.deps.fs, root.kind, root.dir, '')))).flat();
    const [files, activity] = await Promise.all([
      this.applyAll(index, decided),
      aggregateActivity(this.deps.fs, dirs.map((d) => d.dir), this.deps.clock.now()),
    ]);
    index.setActivity(activity);
    const stats: BuildStats = {
      files,
      entries: index.size + index.listVars(() => true).length,
      invalid: index.excluded.invalidFiles().length,
      conflictCopies: index.excluded.conflictCopies().length,
      durationMs: this.deps.clock.now().getTime() - started,
    };
    return { index, stats };
  }

  /**
   * Applies the current state of one path to the view (watcher events). A directory is rescanned
   * as a whole (a moved or synced folder may report only its own path).
   * @param index - View.
   * @param roots - Store roots.
   * @param path - Absolute path that changed.
   * @returns When applied.
   */
  async reload(index: StoreIndex, roots: StoreRoots, path: string): Promise<void> {
    const file = locate(rootDirs(roots), path);
    if (file === undefined) {
      return;
    }
    const stat = await this.deps.fs.lstat(path);
    if (stat === undefined) {
      index.removeTree(path, sep);
    } else if (stat.isDirectory) {
      index.removeTree(path, sep);
      await this.applyAll(index, await listDecided(this.deps.fs, file.root, path, file.relative));
    } else if (scanDecision(file) !== 'skip') {
      await this.applyAll(index, [{ file, decision: scanDecision(file) }]);
    }
  }

  /**
   * Applies decided files: reads entities and variables (bounded), records temps and copies.
   * @param index - View.
   * @param decided - Files with their decisions (global root first, then by path).
   * @returns Number of files read.
   */
  private async applyAll(index: StoreIndex, decided: readonly Decided[]): Promise<number> {
    const ordered = [...decided].sort((a, b) => (a.file.root === b.file.root ? 0 : a.file.root === 'global' ? -1 : 1));
    const toRead = ordered.filter((d) => d.decision === 'read').map((d) => d.file);
    for (const d of ordered.filter((x) => x.decision !== 'read')) {
      await this.applyNonEntity(index, d.file, d.decision);
    }
    const results = await mapLimit(toRead, MAX_OPEN_FILES, async (file) => ({ file, outcome: await loadStoreFile(this.deps.fs, file) }));
    results.forEach((r) => apply(index, r));
    return toRead.length;
  }

  /**
   * Records a temp file or a conflict copy.
   * @param index - View.
   * @param file - File.
   * @param decision - `temp` or `conflict_copy`.
   * @returns When recorded.
   */
  private async applyNonEntity(index: StoreIndex, file: ScannedFile, decision: ScanDecision): Promise<void> {
    if (decision === 'conflict_copy') {
      index.exclude({ ...file, reason: 'conflict_copy' }, 'conflict_copy');
      return;
    }
    const stat = await this.deps.fs.lstat(file.path);
    if (stat?.isFile === true) {
      index.addTemp({ ...file, mtimeMs: stat.mtimeMs });
    }
  }
}
