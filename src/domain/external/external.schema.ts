/**
 * References to items of the User's task tracker (WL-23). warlog only stores them: it never
 * calls the tracker, keeps no credential for it and does not synchronize status (WL-24).
 */
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { isHttpsUrl } from '../link/link-target-parser.ts';

/** Entity types that can hold external references. */
export const EXTERNAL_HOLDERS: ReadonlySet<string> = new Set(['epic', 'story', 'task']);

/** A stored external reference. */
export interface ExternalReference {
  /** Tracker (jira, clickup, github, …). */
  readonly system: string;
  /** Key in that tracker. */
  readonly key: string;
  /** Link to the item (https). */
  readonly url?: string;
}

/**
 * Tells whether a text is a tracker name: lower-case letters, digits, `_` and `-`.
 * @param text - Candidate.
 * @returns `true` for 1 to 32 such characters.
 */
function isSystemName(text: string): boolean {
  return text.length >= 1 && text.length <= 32 && [...text].every((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '_' || c === '-');
}

/** Tracker name. */
export const EXTERNAL_SYSTEM = z.string().refine(isSystemName, 'must be 1-32 characters of [a-z0-9_-]').describe('Tracker name (jira, clickup, github, …)');

/** Key in the tracker. */
export const EXTERNAL_KEY = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((v) => [...v].every((c) => c >= ' ' && c !== '\u007f'), 'must not contain control characters')
  .describe('Key in that tracker (e.g. SQ-1234)');

/** URL of the item. */
export const EXTERNAL_URL = z.string().max(2_048).refine(isHttpsUrl, 'must be an https:// URL without spaces').optional().describe('https URL of the item');

/**
 * External references of an entity.
 * @param entity - Entity.
 * @returns The references.
 */
export function externalsOfEntity(entity: IndexedEntity): ExternalReference[] {
  const external = entity.record.data['external'];
  return Array.isArray(external) ? external.filter((e: unknown): e is ExternalReference => typeof e === 'object' && e !== null && typeof Reflect.get(e, 'system') === 'string' && typeof Reflect.get(e, 'key') === 'string') : [];
}

/**
 * Fails unless an entity can hold external references.
 * @param entity - Entity.
 * @throws {WarlogError} `VALIDATION` for types other than epic, story and task.
 */
export function assertHolder(entity: IndexedEntity): void {
  if (!EXTERNAL_HOLDERS.has(entity.type)) {
    throw new WarlogError('VALIDATION', `external references belong to epics, stories and tasks, not ${entity.type}`, { field: 'id', type: entity.type });
  }
}
