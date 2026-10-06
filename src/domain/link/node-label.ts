/**
 * Short descriptions of graph nodes for link and trace results: an entity (type, title/name,
 * status) or an external reference.
 */
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { parseLinkTarget } from './link-target-parser.ts';

/**
 * Title of an entity (`title`, else `name`, else `cmd`).
 * @param entity - Entity.
 * @returns The label.
 */
export function labelOf(entity: IndexedEntity): string {
  return text(entity, 'title') || text(entity, 'name') || text(entity, 'cmd') || entity.id;
}

/**
 * Brief of an entity.
 * @param entity - Entity.
 * @returns `{ id, type, label, status? }`.
 */
export function entityBrief(entity: IndexedEntity): Row {
  const status = text(entity, 'status');
  return { id: entity.id, type: entity.type, label: labelOf(entity), ...(status === '' ? {} : { status }) };
}

/**
 * Brief of a link target.
 * @param view - View.
 * @param target - Target text (entity id or reference).
 * @returns The entity brief; `pending: true` for an id not in the store; `type` of the reference otherwise.
 */
export function targetBrief(view: StoreView, target: string): Row {
  const parsed = parseLinkTarget(target);
  if (parsed?.kind !== 'entity') {
    return { id: target, type: parsed?.kind ?? 'reference', label: target };
  }
  const entity = view.get(target);
  return entity === undefined ? { id: target, type: 'pending', label: target, pending: true } : entityBrief(entity);
}
