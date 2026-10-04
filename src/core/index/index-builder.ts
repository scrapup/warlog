/**
 * Builds and maintains the view from the files of both roots (plan §3.7, WL-06, WL-43, WL-44):
 * at most {@link MAX_OPEN_FILES} files read at a time; bad files are recorded, never thrown.
 */
import { join, sep } from 'node:path';
import type { Clock } from '../ports/clock.port.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import { compareCodeUnits } from '../security/compare.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import { aggregateActivity } from './activity-aggregator.ts';
import { MAX_OPEN_FILES, mapLimit } from './bounded.ts';
import { readStoreFile, scanDecision } from './entity-reader.ts';
import type { ReadOutcome } from './entity-reader.ts';
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

/** A store root to scan. */
interface RootDir {
  /** Root kind. */
  readonly kind: RootKind;
  /** Absolute directory. */
  readonly dir: string;
}

/** A scanned file with its read outcome (or `undefined` for temp files and copies). */
interface FileResult {
  /** File. */
  readonly file: ScannedFile;
  /** Outcome of reading it. */
  readonly outcome: ReadOutcome;
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
   * Builds the view of both roots.
   * @param roots - Store roots.
   * @returns The view and build figures.
   */
  async build(roots: StoreRoots): Promise<BuildResult> {
    const started = this.deps.clock.now().getTime();
    const index = new StoreIndex();
    const dirs = rootDirs(roots);
    const files = (await Promise.all(dirs.map((root) => this.scan(root)))).flat().sort((a, b) => compareCodeUnits(a.path, b.path));
    const toRead: ScannedFile[] = [];
    for (const file of files) {
      const decision = scanDecision(file);
      if (decision === 'read') {
        toRead.push(file);
      } else if (decision !== 'skip') {
        await this.applyNonEntity(index, file, decision);
      }
    }
    const results = await mapLimit(toRead, MAX_OPEN_FILES, (file) => this.read(file));
    results.forEach((r) => apply(index, r));
    index.setActivity(await aggregateActivity(this.deps.fs, dirs.map((d) => d.dir), this.deps.clock.now()));
    const stats: BuildStats = {
      files: toRead.length,
      entries: index.size + index.listVars(() => true).length,
      invalid: index.excluded.invalidFiles().length,
      conflictCopies: index.excluded.conflictCopies().length,
      durationMs: this.deps.clock.now().getTime() - started,
    };
    return { index, stats };
  }

  /**
   * Applies the current state of one file to the view (watcher events).
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
    const decision = scanDecision(file);
    const stat = await this.deps.fs.stat(path);
    if (stat === undefined) {
      index.removeTree(path, sep);
      return;
    }
    if (stat.isDirectory || decision === 'skip') {
      return;
    }
    if (decision === 'read') {
      apply(index, await this.read(file));
    } else {
      await this.applyNonEntity(index, file, decision);
    }
  }

  /**
   * Lists the files of a root.
   * @param root - Root.
   * @returns Scanned files.
   */
  private async scan(root: RootDir): Promise<ScannedFile[]> {
    const entries = await this.deps.fs.readDir(root.dir, { recursive: true });
    return entries.map((relative) => ({ root: root.kind, relative, path: join(root.dir, ...relative.split('/')) }));
  }

  /**
   * Reads and interprets one file.
   * @param file - File.
   * @returns The outcome (`unreadable` when it cannot be read).
   */
  private async read(file: ScannedFile): Promise<FileResult> {
    try {
      return { file, outcome: readStoreFile(file, await this.deps.fs.readFile(file.path)) };
    } catch {
      return { file, outcome: { kind: 'invalid', reason: 'unreadable' } };
    }
  }

  /**
   * Records a temp file or a conflict copy.
   * @param index - View.
   * @param file - File.
   * @param decision - `temp` or `conflict_copy`.
   * @returns When recorded.
   */
  private async applyNonEntity(index: StoreIndex, file: ScannedFile, decision: 'temp' | 'conflict_copy'): Promise<void> {
    if (decision === 'conflict_copy') {
      index.exclude({ ...file, reason: 'conflict_copy' }, 'conflict_copy');
      return;
    }
    const stat = await this.deps.fs.stat(file.path);
    if (stat !== undefined && !stat.isDirectory) {
      index.addTemp({ ...file, mtimeMs: stat.mtimeMs });
    }
  }
}

/**
 * Applies a read outcome; a second file with an id already in the view is excluded (`duplicate_id`).
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
 * @param dirs - Roots (repository first wins when nested).
 * @param path - Absolute path.
 * @returns The scanned file, or `undefined` outside every root.
 */
function locate(dirs: readonly RootDir[], path: string): ScannedFile | undefined {
  const root = [...dirs].sort((a, b) => b.dir.length - a.dir.length).find((d) => path.startsWith(`${d.dir}${sep}`));
  return root === undefined ? undefined : { root: root.kind, path, relative: path.slice(root.dir.length + 1).split(sep).join('/') };
}
