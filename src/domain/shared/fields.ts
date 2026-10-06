/**
 * Input building blocks shared by the tracker operations: parameter names, enums and defaults
 * follow the current tracker (plan §1.1, WL-10); identifiers are opaque ULID strings (WL-11).
 */
import { z } from 'zod';
import { isUlid } from '../../core/security/identifiers.ts';

/** Priorities, lowest to highest. */
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
/** Project statuses. */
export const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'] as const;
/** Epic (and story) statuses. */
export const EPIC_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const;
/** Task statuses. */
export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const;
/** Subtask statuses. */
export const SUBTASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
/** Note types. */
export const NOTE_TYPES = ['general', 'decision', 'context', 'meeting', 'technical', 'blocker', 'progress', 'release'] as const;
/** Entity types a note can relate to. */
export const NOTE_RELATED_TYPES = ['project', 'epic', 'task'] as const;

/** A priority. */
export type Priority = (typeof PRIORITIES)[number];
/** A task status. */
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * An entity identifier (ULID string, WL-11).
 * @param description - Help text.
 * @returns The schema.
 */
export function idField(description: string): z.ZodString {
  return z.string().refine(isUlid, 'must be a ULID').describe(description);
}

/**
 * A list of entity identifiers.
 * @param description - Help text.
 * @returns The schema.
 */
export function idListField(description: string): z.ZodArray<z.ZodString> {
  return z.array(z.string().refine(isUlid, 'must be a ULID')).describe(description);
}

/** Optional project scope (`WARLOG_PROJECT` when omitted). */
export const PROJECT_SCOPE = z
  .string()
  .refine(isUlid, 'must be a ULID')
  .optional()
  .describe('Scope to one project. Defaults to WARLOG_PROJECT if set, else the whole store.');

/** Branch filter (`"current"` = active git branch, `""` = branch-agnostic only). */
export const BRANCH_FILTER = z
  .string()
  .max(255)
  .optional()
  .describe('Git branch filter: "current" = active branch, "" = branch-agnostic only, omit = all.');

/** Include archived epics and their tasks. */
export const INCLUDE_ARCHIVED = z.boolean().default(false).describe('Include archived epics and their tasks.');

/** Tags. */
export const TAGS = z.array(z.string().min(1).max(64)).max(64).optional().describe('Tags');

/** A non-empty, bounded single-line name or title. */
export const TITLE = z.string().trim().min(1).max(500);

/** A Markdown description (entity body). */
export const DESCRIPTION = z.string().max(200_000).optional();

/** Proceed despite unmet prerequisites (logged). */
export const FORCE = z
  .boolean()
  .default(false)
  .describe('Proceed despite unmet prerequisites. Only when a human says the blocker no longer applies, never on your own initiative. Logged.');

/**
 * A row limit.
 * @param fallback - Default.
 * @returns The schema.
 */
export function limitField(fallback: number): z.ZodDefault<z.ZodNumber> {
  return z.number().int().min(1).max(1000).default(fallback).describe('Max results');
}

/**
 * An optional enum whose default is documented but applied by the handler, for upserts where an
 * omitted value must not overwrite the stored one.
 * @param values - Enum values.
 * @param fallback - Documented default.
 * @returns The schema.
 */
export function enumWithDocumentedDefault<const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]): z.ZodOptional<z.ZodEnum<{ [K in T[number]]: K }>> {
  return z.enum(values).optional().meta({ default: fallback });
}
