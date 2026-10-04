/**
 * Resolution of the store roots (WL-01, WL-70): the synchronized global root and the
 * repository root (`<main worktree>/.warlog` or `<global>/repos/<key>`).
 */
import { isAbsolute, join } from 'node:path';
import { WarlogError, isWarlogError } from '../errors/warlog-error.ts';
import type { LocatedRepo, RepoLocator } from '../git/repo-locator.ts';
import type { Env } from '../ports/env.port.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { GitClient } from '../ports/git-client.port.ts';
import { assertValid, isRepoKey } from '../security/identifiers.ts';
import type { PathGuard } from '../security/path-guard.ts';
import { parseYaml } from './yaml-codec.ts';

/** Where repository data lives (WL-70). */
export type StorageMode = 'in-repo' | 'global';

/** The repository root of the current working directory. */
export interface RepositoryRoot {
  /** Directory holding repository data. */
  readonly root: string;
  /** Repository key. */
  readonly key: string;
  /** Storage mode. */
  readonly mode: StorageMode;
  /** Main working tree. */
  readonly mainWorktree: string;
}

/** Store roots of a session. */
export interface StoreRoots {
  /** Global root (`$WARLOG_DIR`, default `~/.warlog`). */
  readonly global: string;
  /** Repository root, absent outside a repository (WL-03). */
  readonly repository?: RepositoryRoot;
  /** Warning codes to return with responses (`repo.local_scope`, `git.unavailable`). */
  readonly warnings: readonly string[];
}

/** Name of the repository variable selecting the storage mode. */
export const STORAGE_MODE_VAR = 'warlog.storage';

/** Collaborators of {@link StoreRootsResolver}. */
export interface StoreRootsResolverDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Environment. */
  readonly env: Env;
  /** Read-only git client. */
  readonly git: GitClient;
  /** Path guard. */
  readonly guard: PathGuard;
  /** Repository locator. */
  readonly locator: RepoLocator;
}

/** Resolves the store roots of a working directory. */
export class StoreRootsResolver {
  /** Collaborators. */
  private readonly deps: StoreRootsResolverDeps;

  /**
   * Creates the resolver.
   * @param deps - Collaborators.
   */
  constructor(deps: StoreRootsResolverDeps) {
    this.deps = deps;
  }

  /**
   * Resolves the roots for `cwd`.
   * @param cwd - Working directory.
   * @returns The roots and warnings.
   * @throws {WarlogError} `INVALID_FILE` when the storage-mode variable is malformed; `VALIDATION` on an unsafe key,
   *   a relative `WARLOG_DIR` or a `.warlog` link leaving the working tree.
   */
  async resolve(cwd: string): Promise<StoreRoots> {
    const global = this.globalRoot();
    const located = await this.deps.locator.locate(cwd);
    if (located === undefined) {
      const gitOk = await this.deps.git.isAvailable(cwd);
      return { global, warnings: gitOk ? [] : ['git.unavailable'] };
    }
    assertValid(isRepoKey(located.key), 'repo_key', 'a safe repository key');
    const mode = await this.readMode(global, located.key);
    const root =
      mode === 'global'
        ? await this.deps.guard.resolveInside(global, 'repos', located.key)
        : await this.deps.guard.resolveInside(located.mainWorktree, '.warlog');
    return { global, repository: { root, key: located.key, mode, mainWorktree: located.mainWorktree }, warnings: this.warningsFor(located, mode) };
  }

  /**
   * The global root: `$WARLOG_DIR` (absolute) or `~/.warlog`.
   * @returns Absolute path.
   * @throws {WarlogError} `VALIDATION` when `WARLOG_DIR` is relative.
   */
  private globalRoot(): string {
    const configured = this.deps.env.get('WARLOG_DIR');
    assertValid(configured === undefined || isAbsolute(configured), 'WARLOG_DIR', 'an absolute path');
    return configured ?? join(this.deps.env.homeDir(), '.warlog');
  }

  /**
   * Warnings for a located repository.
   * @param located - Repository.
   * @param mode - Storage mode.
   * @returns `repo.local_scope` when global data is keyed by a local-only key (WL-03).
   */
  private warningsFor(located: LocatedRepo, mode: StorageMode): string[] {
    return mode === 'global' && !located.hasRemote ? ['repo.local_scope'] : [];
  }

  /**
   * Reads the storage mode from `<global>/repos/<key>/vars/warlog.storage.yaml`.
   * @param global - Global root.
   * @param key - Repository key.
   * @returns The mode (`in-repo` when unset).
   * @throws {WarlogError} `INVALID_FILE` when the value is not a known mode.
   */
  private async readMode(global: string, key: string): Promise<StorageMode> {
    const path = await this.deps.guard.resolveInside(global, 'repos', key, 'vars', `${STORAGE_MODE_VAR}.yaml`);
    let text: string;
    try {
      text = await this.deps.fs.readFile(path);
    } catch (error: unknown) {
      if (isWarlogError(error, 'NOT_FOUND')) {
        return 'in-repo';
      }
      throw error;
    }
    const parsed = parseYaml(text, path);
    const value = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'value') : undefined;
    if (value !== 'in-repo' && value !== 'global') {
      throw new WarlogError('INVALID_FILE', `${path}: ${STORAGE_MODE_VAR} must be in-repo or global`, { reason: 'value', file: path });
    }
    return value;
  }
}
