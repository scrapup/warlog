/**
 * Values held by the in-memory index (plan §3.7).
 */
import type { EntityRecord, EntityType, Scope } from '../storage/entity-ref.ts';

/** Which store root a file belongs to. */
export type RootKind = 'global' | 'repo';

/** A file found by a scan. */
export interface ScannedFile {
  /** Absolute path. */
  readonly path: string;
  /** Root holding the file. */
  readonly root: RootKind;
  /** Path relative to the root, `/`-separated. */
  readonly relative: string;
}

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
  /** Why it is excluded (`merge_conflict`, `front_matter`, `yaml`, `duplicate_id`, `id_mismatch`, …). */
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
