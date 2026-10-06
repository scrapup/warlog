/**
 * The `links` field of an entity (plan §3.2): reading and rewriting the list.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import type { LinkRelation } from './link-target-parser.ts';

/** Most links one entity holds. */
export const MAX_LINKS = 200;

/** A stored link. */
export interface StoredLink {
  /** Relation. */
  readonly rel: string;
  /** Target (entity id or reference). */
  readonly target: string;
}

/**
 * Links stored on an entity.
 * @param entity - Entity.
 * @returns The links, in stored order.
 */
export function linksOfEntity(entity: IndexedEntity): StoredLink[] {
  const links = entity.record.data['links'];
  return Array.isArray(links) ? links.filter((l: unknown): l is StoredLink => typeof l === 'object' && l !== null && typeof Reflect.get(l, 'rel') === 'string' && typeof Reflect.get(l, 'target') === 'string') : [];
}

/**
 * Finds any entity by id.
 * @param view - View.
 * @param id - Entity id.
 * @returns The entity.
 * @throws {WarlogError} `NOT_FOUND`.
 */
export function entityById(view: StoreView, id: string): IndexedEntity {
  const found = view.get(id);
  if (found === undefined) {
    throw new WarlogError('NOT_FOUND', `entity ${id} not found`, { id });
  }
  return found;
}

/**
 * Tells whether a link is in a list.
 * @param links - Links.
 * @param rel - Relation.
 * @param target - Target.
 * @returns `true` when present.
 */
export function hasLink(links: readonly StoredLink[], rel: LinkRelation, target: string): boolean {
  return links.some((l) => l.rel === rel && l.target === target);
}
