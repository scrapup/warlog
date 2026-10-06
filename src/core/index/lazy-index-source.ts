/**
 * The command line's view (plan §3.7): point reads open only the entity's file; the full index is
 * built at most once per process, on the first `full()`.
 */
import { join, relative, sep } from 'node:path';
import { isUlid } from '../security/identifiers.ts';
import type { WarlogError } from '../errors/warlog-error.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { IndexSource, IndexedEntity, StoreView } from '../ports/store-view.port.ts';
import type { EntityRef, EntityType } from '../storage/entity-ref.ts';
import type { EntityPaths } from '../storage/entity-paths.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import { loadStoreFile } from './file-loader.ts';
import type { IndexBuilder } from './index-builder.ts';
import { entityFrom, entityOfType } from './index-source.ts';
import type { StoreIndex } from './store-index.ts';

/** Types found by probing the repository and global roots (no project). */
const SCOPE_TYPES: ReadonlySet<EntityType> = new Set<EntityType>(['project', 'template', 'memory']);

/** Types found by probing each project directory (`projects/<id>/…`). */
const PROJECT_TYPES: ReadonlySet<EntityType> = new Set<EntityType>(['epic', 'story', 'task', 'note']);

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
  private built: Promise<StoreIndex> | undefined;

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
    return this.index();
  }

  /**
   * Builds the full index (once).
   * @returns The mutable index.
   */
  private async index(): Promise<StoreIndex> {
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
    return this.readOne(ref);
  }

  /**
   * Finds an entity by id: from the full index when built, otherwise by probing its candidate
   * files (project-scoped types in every project directory, project-less notes, global
   * templates); other types need the full index.
   * @param type - Entity type.
   * @param id - Entity id.
   * @returns The entity, when found with that type.
   * @throws {WarlogError} `VALIDATION` for a malformed id.
   */
  async lookup(type: EntityType, id: string): Promise<IndexedEntity | undefined> {
    if (this.built !== undefined || !(PROJECT_TYPES.has(type) || SCOPE_TYPES.has(type))) {
      return entityOfType(await this.full(), type, id);
    }
    for (const ref of await this.candidates(type, id)) {
      const found = await this.readOne(ref);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Applies a written file to the full index when it was built (point reads always read the disk).
   * @param path - Absolute path written.
   * @returns When applied.
   */
  async refresh(path: string): Promise<void> {
    if (this.built !== undefined) {
      await this.deps.builder.reload(await this.built, this.deps.roots, path);
    }
  }

  /**
   * Candidate locations of an entity whose project is unknown.
   * @param type - Entity type (project, project-scoped type or template).
   * @param id - Entity id.
   * @returns References to probe, in order.
   */
  private async candidates(type: EntityType, id: string): Promise<EntityRef[]> {
    if (type === 'template') {
      return [{ type, id, scope: 'global' }];
    }
    if (type === 'memory') {
      return [...(this.deps.roots.repository === undefined ? [] : [{ type, id, scope: 'repo' as const }]), { type, id, scope: 'global' as const }];
    }
    if (this.deps.roots.repository === undefined) {
      return [];
    }
    if (type === 'project') {
      return [{ type, id, scope: 'repo', projectId: id }];
    }
    const projects = await this.deps.fs.readDir(join(this.deps.paths.rootOf('repo'), 'projects'));
    const refs: EntityRef[] = projects.filter((p) => isUlid(p)).map((projectId) => ({ type, id, scope: 'repo', projectId }));
    return type === 'note' ? [...refs, { type, id, scope: 'repo' }] : refs;
  }

  /**
   * Reads one entity file.
   * @param ref - Entity reference.
   * @returns The entity, or `undefined` when missing, invalid, a link, too large or of another type.
   * @throws {WarlogError} `NO_REPO_CONTEXT` / `VALIDATION` for an invalid reference.
   */
  private async readOne(ref: EntityRef): Promise<IndexedEntity | undefined> {
    const path = await this.deps.paths.pathFor(ref);
    const root = this.deps.paths.rootOf(ref.scope);
    const file = { root: ref.scope, path, relative: relative(root, path).split(sep).join('/') };
    const outcome = await loadStoreFile(this.deps.fs, file);
    return outcome.kind === 'entity' && outcome.entity.type === ref.type ? outcome.entity : undefined;
  }
}
