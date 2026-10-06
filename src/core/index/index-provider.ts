/**
 * Gives each call the index source matching the process profile (plan §3.7): `lazy` for the
 * command line (point reads, full index built on demand per process), `live` for the MCP server
 * (one index for the session's roots, built once, kept current by a watcher the caller starts,
 * and released by {@link IndexProvider.close}). `load: point` operations get a source that
 * refuses the full index, in both profiles.
 */
import { WarlogError } from '../errors/warlog-error.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { Logger } from '../ports/logger.port.ts';
import type { IndexSource, IndexedEntity, StoreView } from '../ports/store-view.port.ts';
import type { PathGuard } from '../security/path-guard.ts';
import type { EntityRef, EntityType } from '../storage/entity-ref.ts';
import { EntityPaths } from '../storage/entity-paths.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import { buildFields } from './index-builder.ts';
import type { IndexBuilder } from './index-builder.ts';
import { entityFrom, entityOfType, pointOnly } from './index-source.ts';
import { LazyIndexSource } from './lazy-index-source.ts';
import type { StoreIndex } from './store-index.ts';

/** Process profile. */
export type IndexMode = 'lazy' | 'live';

/** How an operation reaches the store (`OperationDefinition.load`). */
export type IndexLoad = 'point' | 'full';

/** Stops what was started for a live index. */
export type Dispose = () => void;

/** Spec SLA of a full build (WL-06): above it the build is logged as a warning. */
export const BUILD_SLA_MS = 5_000;

/** Collaborators of {@link IndexProvider}. */
export interface IndexProviderDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Index builder. */
  readonly builder: IndexBuilder;
  /** Path guard. */
  readonly guard: PathGuard;
  /** Logger (counts only). */
  readonly logger: Logger;
  /** Process profile. */
  readonly mode: IndexMode;
  /**
   * Called after a live index is built (starts its watcher).
   * @param index - The new view.
   * @param roots - Its roots.
   * @returns A function stopping what was started.
   */
  readonly onBuilt?: (index: StoreIndex, roots: StoreRoots) => Dispose;
}

/** The live index of one set of roots. */
interface LiveEntry {
  /** Roots key. */
  readonly key: string;
  /** The index, once built. */
  readonly index: Promise<StoreIndex>;
  /** Stops the watcher (set after the build). */
  dispose: Dispose | undefined;
}

/**
 * Cache key of a session's roots.
 * @param roots - Roots.
 * @returns The key.
 */
function keyOf(roots: StoreRoots): string {
  return `${roots.global}\u0000${roots.repository?.root ?? ''}`;
}

/** Index sources per roots. */
export class IndexProvider {
  /** Collaborators. */
  private readonly deps: IndexProviderDeps;
  /** The live index (one set of roots at a time). */
  private live: LiveEntry | undefined;

  /**
   * Creates the provider.
   * @param deps - Collaborators.
   */
  constructor(deps: IndexProviderDeps) {
    this.deps = deps;
  }

  /**
   * The source of one call.
   * @param roots - Roots of the call.
   * @param load - How the operation reaches the store.
   * @param operation - Operation name (for the `load: point` error).
   * @returns The source.
   */
  sourceFor(roots: StoreRoots, load: IndexLoad, operation: string): IndexSource {
    const source: IndexSource =
      this.deps.mode === 'lazy'
        ? new LazyIndexSource({ fs: this.deps.fs, builder: this.deps.builder, paths: new EntityPaths(roots, this.deps.guard), roots })
        : {
            full: (): Promise<StoreView> => this.ensure(roots),
            entity: async (ref: EntityRef): Promise<IndexedEntity | undefined> => entityFrom(await this.ensure(roots), ref),
            lookup: async (type: EntityType, id: string): Promise<IndexedEntity | undefined> => entityOfType(await this.ensure(roots), type, id),
            refresh: async (path: string): Promise<void> => this.deps.builder.reload(await this.ensure(roots), roots, path),
          };
    return load === 'point' ? pointOnly(source, operation) : source;
  }

  /**
   * Builds the live index of some roots once; a different set of roots replaces the previous
   * index and stops its watcher.
   * @param roots - Roots.
   * @returns The index.
   * @throws {WarlogError} `INTERNAL` in the lazy (command-line) profile.
   */
  ensure(roots: StoreRoots): Promise<StoreIndex> {
    if (this.deps.mode !== 'live') {
      throw new WarlogError('INTERNAL', 'a live index is only available in the MCP server profile');
    }
    const key = keyOf(roots);
    if (this.live?.key === key) {
      return this.live.index;
    }
    this.close();
    const entry: LiveEntry = { key, index: this.buildLive(roots), dispose: undefined };
    this.live = entry;
    entry.index.then(
      (index) => {
        if (this.live === entry) {
          entry.dispose = this.deps.onBuilt?.(index, roots);
        }
      },
      () => {
        if (this.live === entry) {
          this.live = undefined;
        }
      },
    );
    return entry.index;
  }

  /** Stops the live index's watcher and forgets the index. */
  close(): void {
    this.live?.dispose?.();
    this.live = undefined;
  }

  /**
   * Builds a live index and logs its figures (`warn` above the SLA).
   * @param roots - Roots.
   * @returns The index.
   */
  private async buildLive(roots: StoreRoots): Promise<StoreIndex> {
    const { index, stats } = await this.deps.builder.build(roots);
    this.deps.logger.log(stats.durationMs > BUILD_SLA_MS ? 'warn' : 'info', 'index.built', { trigger: 'start', ...buildFields(stats) });
    return index;
  }
}
