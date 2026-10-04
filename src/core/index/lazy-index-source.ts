/**
 * The command line's view (plan §3.7): point reads open only the entity's file; the full index is
 * built at most once per process, on the first `full()`.
 */
import { relative, sep } from 'node:path';
import type { WarlogError } from '../errors/warlog-error.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { IndexSource, IndexedEntity, StoreView } from '../ports/store-view.port.ts';
import type { EntityRef } from '../storage/entity-ref.ts';
import type { EntityPaths } from '../storage/entity-paths.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import { loadStoreFile } from './file-loader.ts';
import type { IndexBuilder } from './index-builder.ts';
import { entityFrom } from './index-source.ts';

/** Collaborators of {@link LazyIndexSource}. */
export interface LazyIndexSourceDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Index builder. */
  readonly builder: IndexBuilder;
  /** Entity paths of the session. */
  readonly paths: EntityPaths;
  /** Store roots. */
  readonly roots: StoreRoots;
}

/** Loads on demand. */
export class LazyIndexSource implements IndexSource {
  /** Collaborators. */
  private readonly deps: LazyIndexSourceDeps;
  /** The full index, once built. */
  private built: Promise<StoreView> | undefined;

  /**
   * Creates the source.
   * @param deps - Collaborators.
   */
  constructor(deps: LazyIndexSourceDeps) {
    this.deps = deps;
  }

  /**
   * Builds the full index (once).
   * @returns The index.
   */
  async full(): Promise<StoreView> {
    this.built ??= this.deps.builder.build(this.deps.roots).then((r) => r.index);
    return this.built;
  }

  /**
   * Reads one entity file (or uses the full index when already built).
   * @param ref - Entity reference.
   * @returns The entity, or `undefined` when missing, invalid, a link or too large.
   * @throws {WarlogError} `NO_REPO_CONTEXT` / `VALIDATION` for an invalid reference.
   */
  async entity(ref: EntityRef): Promise<IndexedEntity | undefined> {
    if (this.built !== undefined) {
      return entityFrom(await this.built, ref);
    }
    const path = await this.deps.paths.pathFor(ref);
    const root = this.deps.paths.rootOf(ref.scope);
    const file = { root: ref.scope, path, relative: relative(root, path).split(sep).join('/') };
    const outcome = await loadStoreFile(this.deps.fs, file);
    return outcome.kind === 'entity' && outcome.entity.type === ref.type ? outcome.entity : undefined;
  }
}
