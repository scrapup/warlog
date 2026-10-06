/**
 * Searches the tracker literally (WL-47). Results are grouped by type with excerpts.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { resolveBranch, resolveProjectScope } from '../shared/lookup.ts';
import { text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { excerpt, matchesAll, tokensOf } from '../shared/text-search.ts';
import type { TrackerSearchInput } from './tracker-search.operation.ts';
import { SEARCH_TYPES } from './tracker-search.operation.ts';
import { trackerScope } from './tracker-scope.ts';

/** How a search type is shown. */
interface HitShape {
  /** Field holding the name or title. */
  readonly name: string;
  /** Fields kept in the hit. */
  readonly fields: readonly string[];
}

/** Name field and kept fields per type. */
const SHAPES: Readonly<Record<(typeof SEARCH_TYPES)[number], HitShape>> = {
  project: { name: 'name', fields: ['status'] },
  epic: { name: 'name', fields: ['project_id', 'status', 'priority', 'branch'] },
  task: { name: 'title', fields: ['project_id', 'epic_id', 'story_id', 'status', 'priority', 'assigned_to', 'due_date'] },
  note: { name: 'title', fields: ['note_type', 'related_entity_type', 'related_entity_id', 'created_at'] },
};

/**
 * Search row of an entity.
 * @param entity - Entity.
 * @param type - Search type.
 * @returns `{ id, <name>, …fields, excerpt }`.
 */
function hit(entity: IndexedEntity, type: (typeof SEARCH_TYPES)[number]): Row {
  const shape = SHAPES[type];
  const fields = Object.fromEntries(shape.fields.filter((f) => entity.record.data[f] !== undefined).map((f) => [f, entity.record.data[f]]));
  return { id: entity.id, [shape.name]: text(entity, shape.name), ...fields, ...(entity.record.body === '' ? {} : { excerpt: excerpt(entity.record.body) }) };
}

/** Handles `tracker_search`. */
export class TrackerSearchHandler implements OperationHandler<TrackerSearchInput> {
  /**
   * Searches every requested type.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ projects?, epics?, tasks?, notes? }`.
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for an unknown project scope.
   */
  async handle(input: TrackerSearchInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const projectId = resolveProjectScope(context, view, input.project_id);
    const scope = trackerScope(view, { projectId, branch: await resolveBranch(context, input.branch), includeHidden: input.include_archived });
    const tokens = tokensOf(input.query);
    const pools: Record<(typeof SEARCH_TYPES)[number], IndexedEntity[]> = {
      project: view.ofType('project').filter((p) => projectId === undefined || p.id === projectId),
      epic: scope.epics,
      task: scope.tasks,
      note: view.ofType('note').filter((n) => !n.deleted && (projectId === undefined || n.projectId === projectId || text(n, 'related_entity_type') === '')),
    };
    const types = input.entity_types ?? [...SEARCH_TYPES];
    const value = Object.fromEntries(
      types.map((type) => [
        `${type}s`,
        pools[type]
          .filter((e) => matchesAll(tokens, `${text(e, SHAPES[type].name)}\n${e.record.body}`))
          .slice(0, input.limit)
          .map((e) => hit(e, type)),
      ]),
    );
    return { kind: 'object', value };
  }
}
