/**
 * The export format of the current tracker (`format_version` 1.0–1.3), read by `tracker_import`
 * and written by `tracker_export` (WL-14). Ids are the exporter's (integers from the current
 * tracker, ULIDs from warlog) and are remapped on import. warlog adds `stories`, epic-less
 * `tasks` and `_original_story_id`, which the current tracker ignores.
 */
import { z } from 'zod';
import { EPIC_STATUSES, NOTE_RELATED_TYPES, NOTE_TYPES, PRIORITIES, PROJECT_STATUSES, SUBTASK_STATUSES, TASK_STATUSES } from '../shared/fields.ts';

/** Export versions accepted. */
export const FORMAT_VERSIONS = ['1.0', '1.1', '1.2', '1.3'] as const;

/** An exporter id. */
const ORIGINAL_ID = z.union([z.number().int(), z.string().min(1).max(64)]);

/** Tags as an array or as the JSON text of one. */
const TAGS = z.union([z.array(z.string()), z.string()]).nullish();

/** Free metadata (ignored on import). */
const METADATA = z.unknown().optional();

/** Optional text that may be `null`. */
const TEXT = z.string().max(200_000).nullish();

/** A subtask. */
const SUBTASK = z.object({ title: z.string().min(1).max(500), status: z.enum(SUBTASK_STATUSES).nullish(), sort_order: z.number().int().nullish() }).strict();

/** A comment. */
const COMMENT = z
  .object({
    author: TEXT,
    content: z.string().max(100_000),
    created_at: TEXT,
    is_deleted: z.union([z.boolean(), z.number().int()]).nullish(),
    deleted_at: TEXT,
    deleted_by: TEXT,
    delete_reason: TEXT,
  })
  .strict();

/** A task. */
const TASK = z
  .object({
    _original_id: ORIGINAL_ID.nullish(),
    _original_story_id: ORIGINAL_ID.nullish(),
    title: z.string().min(1).max(500),
    code: TEXT,
    description: TEXT,
    status: z.enum(TASK_STATUSES).nullish(),
    priority: z.enum(PRIORITIES).nullish(),
    sort_order: z.number().int().nullish(),
    assigned_to: TEXT,
    estimated_hours: z.number().nullish(),
    actual_hours: z.number().nullish(),
    due_date: TEXT,
    source_ref: z.union([z.record(z.string(), z.unknown()), z.string()]).nullish(),
    description_locked: z.union([z.boolean(), z.number().int()]).nullish(),
    tags: TAGS,
    metadata: METADATA,
    depends_on: z.array(ORIGINAL_ID).nullish(),
    subtasks: z.array(SUBTASK).nullish(),
    comments: z.array(COMMENT).nullish(),
  })
  .strict();

/** A story (warlog extension). */
const STORY = z
  .object({
    _original_id: ORIGINAL_ID,
    _original_epic_id: ORIGINAL_ID.nullish(),
    title: z.string().min(1).max(500),
    code: TEXT,
    description: TEXT,
    status: z.enum(EPIC_STATUSES).nullish(),
    priority: z.enum(PRIORITIES).nullish(),
    sort_order: z.number().int().nullish(),
    tags: TAGS,
  })
  .strict();

/** An epic. */
const EPIC = z
  .object({
    _original_id: ORIGINAL_ID.nullish(),
    name: z.string().min(1).max(500),
    description: TEXT,
    status: z.enum(EPIC_STATUSES).nullish(),
    priority: z.enum(PRIORITIES).nullish(),
    sort_order: z.number().int().nullish(),
    branch: TEXT,
    tags: TAGS,
    metadata: METADATA,
    tasks: z.array(TASK).nullish(),
  })
  .strict();

/** A note. */
const NOTE = z
  .object({
    title: z.string().min(1).max(500),
    content: z.string().max(200_000),
    note_type: z.enum(NOTE_TYPES).nullish(),
    related_entity_type: z.enum(NOTE_RELATED_TYPES).nullish(),
    _original_related_entity_id: ORIGINAL_ID.nullish(),
    tags: TAGS,
    metadata: METADATA,
  })
  .strict();

/** A whole export. */
export const SAGA_EXPORT = z
  .object({
    format_version: z.enum(FORMAT_VERSIONS),
    exported_at: z.string().max(64).optional(),
    generator: z.string().max(64).optional(),
    project: z
      .object({
        name: z.string().min(1).max(500),
        description: TEXT,
        status: z.enum(PROJECT_STATUSES).nullish(),
        tags: TAGS,
        metadata: METADATA,
        epics: z.array(EPIC).nullish(),
        stories: z.array(STORY).nullish(),
        tasks: z.array(TASK).nullish(),
      })
      .strict(),
    notes: z.array(NOTE).nullish(),
  })
  .strict();

/** A parsed export. */
export type SagaExport = z.infer<typeof SAGA_EXPORT>;
/** A parsed task. */
export type ExportTask = z.infer<typeof TASK>;
/** A parsed epic. */
export type ExportEpic = z.infer<typeof EPIC>;
/** A parsed story. */
export type ExportStory = z.infer<typeof STORY>;
/** A parsed note. */
export type ExportNote = z.infer<typeof NOTE>;

/**
 * Tags of an export record.
 * @param value - Array or JSON text.
 * @returns The tags.
 */
export function tagsFrom(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return value.split(',').map((t) => t.trim()).filter((t) => t !== '');
  }
}
