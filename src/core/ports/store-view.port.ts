/**
 * Read contract of the store view (plan §3.7): what operations may see of the index. The index
 * itself (mutations used by the builder and the watcher) stays inside `core/index`.
 */
import type { WarlogError } from '../errors/warlog-error.ts';
import type { EntityRecord, EntityRef, EntityType, Scope } from '../storage/entity-ref.ts';

/** Which store root a file belongs to. */
export type RootKind = 'global' | 'repo';

/** An entity in the view. */
export interface IndexedEntity {
  /** Entity id (ULID, or slug for questionnaires). */
  readonly id: string;
  /** Entity type. */
  readonly type: EntityType;
  /** Data scope. */
  readonly scope: Scope;
  /** Owning project, when project-scoped. */
  readonly projectId: string | undefined;
  /** Absolute file path. */
  readonly path: string;
  /** Front matter and body. */
  readonly record: EntityRecord;
  /** Whether the entity is soft-deleted (WL-08). */
  readonly deleted: boolean;
}

/** A variable file in the view. */
export interface IndexedVar {
  /** Variable name. */
  readonly name: string;
  /** Data scope. */
  readonly scope: Scope;
  /** Owning project, for project variables. */
  readonly projectId: string | undefined;
  /** Absolute file path. */
  readonly path: string;
  /** Parsed file content. */
  readonly data: Readonly<Record<string, unknown>>;
}

/** A link from one entity to another target (WL-21, WL-44). */
export interface EntityLink {
  /** Source entity. */
  readonly from: string;
  /** Relation (`implements`, `tests`, …, or `depends_on`). */
  readonly rel: string;
  /** Target (ULID or prefixed reference). */
  readonly target: string;
}

/** A file excluded from the view (WL-43). */
export interface FileProblem {
  /** Root holding the file. */
  readonly root: RootKind;
  /** Path relative to the root. */
  readonly relative: string;
  /** Absolute path. */
  readonly path: string;
  /** Why it is excluded (`merge_conflict`, `front_matter`, `yaml`, `duplicate_id`, `symlink`, `too_large`, …). */
  readonly reason: string;
}

/** A temporary file left by an interrupted write. */
export interface TempFile {
  /** Root holding the file. */
  readonly root: RootKind;
  /** Path relative to the root. */
  readonly relative: string;
  /** Absolute path. */
  readonly path: string;
  /** Last modification time (ms since epoch). */
  readonly mtimeMs: number;
}

/** Recall usage of one entity. */
export interface UsageStats {
  /** Number of `recalled` records. */
  readonly count: number;
  /** Most recent record (ISO 8601). */
  readonly lastAt: string;
}

/** One `command_observed` record. */
export interface CommandObservation {
  /** When (ISO 8601). */
  readonly ts: string;
  /** Machine that observed it. */
  readonly machine: string;
  /** `ok` or `fail`. */
  readonly outcome: string;
  /** Exit code, when recorded. */
  readonly exitCode: number | undefined;
  /** Environment (`os`, `node`). */
  readonly env: Readonly<Record<string, unknown>>;
}

/** Activity read from the store (last 90 days). */
export interface ActivitySummary {
  /** Recall usage by entity id. */
  readonly usage: ReadonlyMap<string, UsageStats>;
  /** Observations by command memory id, oldest first. */
  readonly commands: ReadonlyMap<string, readonly CommandObservation[]>;
  /** Lines that could not be read. */
  readonly invalidLines: number;
  /** Activity files that could not be read. */
  readonly unreadableFiles: number;
}

/** Files kept out of the view (WL-43). */
export interface ExcludedView {
  /**
   * Files excluded as invalid.
   * @returns Problems, ordered by path.
   */
  invalidFiles(): FileProblem[];
  /**
   * Sync-service conflict copies.
   * @returns Copies, ordered by path.
   */
  conflictCopies(): FileProblem[];
  /**
   * Temporary files.
   * @returns Files, ordered by path.
   */
  tempFiles(): TempFile[];
}

/** Read-only view of the store. */
export interface StoreView {
  /** Number of entities. */
  readonly size: number;
  /** Excluded files. */
  readonly excluded: ExcludedView;
  /** Activity of the last 90 days. */
  readonly activity: ActivitySummary;
  /**
   * Returns an entity.
   * @param id - Entity id.
   * @returns The entity, when present.
   */
  get(id: string): IndexedEntity | undefined;
  /**
   * Lists entities of a type (and project), ordered by id.
   * @param type - Entity type.
   * @param projectId - Project filter (`undefined` = entities without project).
   * @returns The entities.
   */
  list(type: EntityType, projectId?: string): IndexedEntity[];
  /**
   * Lists the entities whose parent field points to an entity.
   * @param parentId - Parent id.
   * @returns The children, ordered by id.
   */
  childrenOf(parentId: string): IndexedEntity[];
  /**
   * Lists the entities linking to a target.
   * @param target - Target id or reference.
   * @returns The source entities, ordered by id.
   */
  backlinksOf(target: string): IndexedEntity[];
  /**
   * Finds the entity carrying an external reference (WL-23).
   * @param system - External system.
   * @param key - External key.
   * @returns The entity, when present.
   */
  byExternal(system: string, key: string): IndexedEntity | undefined;
  /**
   * Links and dependencies whose entity target is not (yet) in the view (WL-44).
   * @returns Pending links, ordered by source.
   */
  pendingLinks(): EntityLink[];
  /**
   * Lists variables.
   * @param filter - Keeps a variable when it returns `true`.
   * @returns The variables, ordered by name.
   */
  listVars(filter: (v: IndexedVar) => boolean): IndexedVar[];
}

/** Access to the view for one call. */
export interface IndexSource {
  /**
   * The whole view.
   * @returns The view.
   * @throws {WarlogError} `INTERNAL` for an operation declared `load: point`.
   */
  full(): Promise<StoreView>;
  /**
   * One entity, without scanning the store.
   * @param ref - Entity reference.
   * @returns The entity, or `undefined` when absent or excluded.
   * @throws {WarlogError} `NO_REPO_CONTEXT` / `VALIDATION` for an invalid reference.
   */
  entity(ref: EntityRef): Promise<IndexedEntity | undefined>;
}
