/**
 * Relations read from an entity's front matter: parent fields, links and dependencies
 * (plan §3.2, §3.3; WL-21, WL-44).
 */
import { compareCodeUnits } from '../security/compare.ts';
import type { EntityLink, IndexedEntity } from './indexed-entity.ts';

/** A value located by a file path. */
export interface HasPath {
  /** Absolute path. */
  readonly path: string;
}

/** Front-matter fields pointing to a parent entity. */
const PARENT_FIELDS = ['project_id', 'epic_id', 'story_id', 'task_id'] as const;

/**
 * Parent ids of an entity.
 * @param entity - Entity.
 * @returns Ids found in its parent fields.
 */
export function parentsOf(entity: IndexedEntity): string[] {
  return PARENT_FIELDS.map((f) => entity.record.data[f]).filter((v): v is string => typeof v === 'string' && v !== entity.id);
}

/**
 * Reads one `links` entry.
 * @param from - Source id.
 * @param value - Entry.
 * @returns The link, when well formed.
 */
function toLink(from: string, value: unknown): EntityLink | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const rel = Reflect.get(value, 'rel');
  const target = Reflect.get(value, 'target');
  return typeof rel === 'string' && typeof target === 'string' ? { from, rel, target } : undefined;
}

/**
 * Links and dependencies of an entity.
 * @param entity - Entity.
 * @returns `links` entries plus `depends_on` ids (rel `depends_on`).
 */
export function linksOf(entity: IndexedEntity): EntityLink[] {
  const { links, depends_on: dependsOn } = entity.record.data;
  const declared = Array.isArray(links) ? links.map((l: unknown) => toLink(entity.id, l)).filter((l): l is EntityLink => l !== undefined) : [];
  const deps = Array.isArray(dependsOn) ? dependsOn.filter((d: unknown): d is string => typeof d === 'string') : [];
  return [...declared, ...deps.map((target) => ({ from: entity.id, rel: 'depends_on', target }))];
}

/**
 * Sorts path-bearing values.
 * @param items - Values.
 * @returns The values, ordered by path.
 */
export function sortByPath<T extends HasPath>(items: T[]): T[] {
  return items.sort((a, b) => compareCodeUnits(a.path, b.path));
}

/**
 * Tells whether a link target is an entity id rather than a prefixed reference (`spec:`, `git:`, …).
 * @param target - Link target.
 * @returns `true` for an entity target.
 */
export function isEntityTarget(target: string): boolean {
  return !target.includes(':');
}

/**
 * Matches an `external` entry (WL-23).
 * @param value - Entry.
 * @param system - System.
 * @param key - Key.
 * @returns `true` on match.
 */
export function isExternal(value: unknown, system: string, key: string): boolean {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'system') === system && Reflect.get(value, 'key') === key;
}
