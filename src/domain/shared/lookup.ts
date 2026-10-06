/**
 * Read helpers shared by the tracker operations: entities by id, the project scope
 * (`WARLOG_PROJECT`, plan §1.1) and the branch filter (`"current"`, `""`).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { IndexSource, IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { isUlid } from '../../core/security/identifiers.ts';
import type { EntityType } from '../../core/storage/entity-ref.ts';

/**
 * Finds an entity by id or fails.
 * @param index - Index source of the call.
 * @param type - Entity type.
 * @param id - Entity id.
 * @returns The entity (soft-deleted ones included).
 * @throws {WarlogError} `NOT_FOUND`.
 */
export async function requireEntity(index: IndexSource, type: EntityType, id: string): Promise<IndexedEntity> {
  const found = await index.lookup(type, id);
  if (found === undefined) {
    throw new WarlogError('NOT_FOUND', `${type} ${id} not found`, { type, id });
  }
  return found;
}

/**
 * Finds an entity of a type in a view or fails.
 * @param view - View.
 * @param type - Entity type.
 * @param id - Entity id.
 * @returns The entity.
 * @throws {WarlogError} `NOT_FOUND`.
 */
export function requireInView(view: StoreView, type: EntityType, id: string): IndexedEntity {
  const found = view.get(id);
  if (found?.type !== type) {
    throw new WarlogError('NOT_FOUND', `${type} ${id} not found`, { type, id });
  }
  return found;
}

/**
 * Resolves the project scope of a query: the explicit id, else `WARLOG_PROJECT` (id or
 * case-insensitive name), else the whole store.
 * @param context - Call context.
 * @param view - Full view.
 * @param explicit - `project_id` parameter.
 * @returns The project id, or `undefined` for the whole store.
 * @throws {WarlogError} `NOT_FOUND` for an unknown explicit project; `VALIDATION` when `WARLOG_PROJECT` names no project.
 */
export function resolveProjectScope(context: OperationContext, view: StoreView, explicit: string | undefined): string | undefined {
  if (explicit !== undefined) {
    return requireInView(view, 'project', explicit).id;
  }
  const configured = context.defaultProject;
  if (configured === undefined) {
    return undefined;
  }
  const projects = view.ofType('project');
  const byId = isUlid(configured) ? view.get(configured) : undefined;
  const match = byId?.type === 'project' ? byId : projects.find((p) => String(p.record.data['name']).toLowerCase() === configured.toLowerCase());
  if (match === undefined) {
    throw new WarlogError('VALIDATION', `WARLOG_PROJECT is set to '${configured}', which is not a project in this store`, {
      known: projects.map((p) => p.id),
    });
  }
  return match.id;
}

/** Resolved branch filter: `undefined` = all, `null` = branch-agnostic only, string = that branch. */
export type BranchFilter = string | null | undefined;

/**
 * Resolves a branch parameter.
 * @param context - Call context.
 * @param value - `branch` parameter.
 * @returns The filter (`"current"` without a branch resolves to `null`).
 */
export async function resolveBranch(context: OperationContext, value: string | undefined): Promise<BranchFilter> {
  if (value === undefined) {
    return undefined;
  }
  if (value === '') {
    return null;
  }
  return value === 'current' ? ((await context.currentBranch()) ?? null) : value;
}

/**
 * Tells whether an epic matches a branch filter.
 * @param epic - Epic.
 * @param filter - Filter.
 * @returns `true` when kept.
 */
export function matchesBranch(epic: IndexedEntity | undefined, filter: BranchFilter): boolean {
  if (filter === undefined) {
    return true;
  }
  const branch = epic?.record.data['branch'];
  return filter === null ? branch === undefined || branch === null : branch === filter;
}
