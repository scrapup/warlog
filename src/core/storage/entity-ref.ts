/**
 * Entity references and records shared by the storage layer (plan §3.1–§3.3).
 */

/** Entity types stored as Markdown files. */
export type EntityType =
  | 'project'
  | 'epic'
  | 'story'
  | 'task'
  | 'note'
  | 'comment'
  | 'memory'
  | 'template'
  | 'questionnaire'
  | 'response';

/** Data scope of an entity (WL-02). */
export type Scope = 'global' | 'repo';

/** Locates one entity file. */
export interface EntityRef {
  /** Entity type. */
  readonly type: EntityType;
  /** ULID (slug for questionnaires). */
  readonly id: string;
  /** Scope of the entity. */
  readonly scope: Scope;
  /** Owning project (project-scoped entities). */
  readonly projectId?: string;
  /** Owning task (comments). */
  readonly taskId?: string;
}

/** A stored entity: front-matter fields and Markdown body. */
export interface EntityRecord {
  /** Front-matter fields, common fields included (`id`, `type`, `rev`, dates, `machine`). */
  readonly data: Readonly<Record<string, unknown>>;
  /** Markdown body. */
  readonly body: string;
}

/** Fields maintained by the repository; callers cannot set them through a patch. */
export const MANAGED_FIELDS: readonly string[] = ['id', 'type', 'rev', 'created_at', 'updated_at', 'machine'];

/** Soft-delete fields, set only by the dedicated delete and restore operations (WL-08). */
export const DELETION_FIELDS: readonly string[] = ['deleted_at', 'deleted_by', 'delete_reason'];
