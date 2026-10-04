/**
 * Gives each call the index source matching the process profile (plan §3.7): `lazy` for the
 * command line (point reads, full index built on demand per process), `live` for the MCP server
 * (one index per roots, built once and kept current by the caller's watcher).
 */
import type { FileSystem } from '../ports/file-system.port.ts';
import type { PathGuard } from '../security/path-guard.ts';
import type { EntityRef } from '../storage/entity-ref.ts';
import { EntityPaths } from '../storage/entity-paths.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import type { IndexBuilder } from './index-builder.ts';
import type { IndexSource } from './index-source.ts';
import { entityFrom } from './index-source.ts';
import type { IndexedEntity } from './indexed-entity.ts';
import { LazyIndexSource } from './lazy-index-source.ts';
import type { StoreIndex } from './store-index.ts';

/** Process profile. */
export type IndexMode = 'lazy' | 'live';

/** Collaborators of {@link IndexProvider}. */
export interface IndexProviderDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Index builder. */
  readonly builder: IndexBuilder;
  /** Path guard. */
  readonly guard: PathGuard;
  /** Process profile. */
  readonly mode: IndexMode;
  /**
   * Called once per live index after its first build (starts the watcher).
   * @param index - The new view.
   * @param roots - Its roots.
   */
  readonly onBuilt?: (index: StoreIndex, roots: StoreRoots) => void;
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
  /** Live indexes by roots. */
  private readonly live = new Map<string, Promise<StoreIndex>>();

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
   * @returns The source.
   */
  sourceFor(roots: StoreRoots): IndexSource {
    if (this.deps.mode === 'lazy') {
      return new LazyIndexSource({ fs: this.deps.fs, builder: this.deps.builder, paths: new EntityPaths(roots, this.deps.guard), roots });
    }
    return {
      full: () => this.ensure(roots),
      entity: async (ref: EntityRef): Promise<IndexedEntity | undefined> => entityFrom(await this.ensure(roots), ref),
    };
  }

  /**
   * Builds the live index of some roots once (MCP start-up, plan §3.7).
   * @param roots - Roots.
   * @returns The index.
   */
  ensure(roots: StoreRoots): Promise<StoreIndex> {
    const key = keyOf(roots);
    let built = this.live.get(key);
    if (built === undefined) {
      built = this.deps.builder.build(roots).then(({ index }) => {
        this.deps.onBuilt?.(index, roots);
        return index;
      });
      built.catch(() => this.live.delete(key));
      this.live.set(key, built);
    }
    return built;
  }
}
