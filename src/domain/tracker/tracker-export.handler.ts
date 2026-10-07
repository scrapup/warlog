/**
 * Exports a project in format 1.3 (plus warlog's story extension).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { byEpicOrder } from '../epic/epic-list.handler.ts';
import { requireInView, resolveProjectScope } from '../shared/lookup.ts';
import { byCreation, sortOrder, tagsOf, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { idsIn, subtasksOf } from '../task/task-graph.ts';
import type { TrackerExportInput } from './tracker-export.operation.ts';

/** Fields copied from a task when present. */
const TASK_FIELDS = ['code', 'status', 'priority', 'sort_order', 'assigned_to', 'estimated_hours', 'actual_hours', 'due_date', 'source_ref', 'description_locked'] as const;

/**
 * Picks defined fields of an entity.
 * @param entity - Entity.
 * @param fields - Field names.
 * @returns The present fields.
 */
function pick(entity: IndexedEntity, fields: readonly string[]): Row {
  return Object.fromEntries(fields.filter((f) => entity.record.data[f] !== undefined && entity.record.data[f] !== null).map((f) => [f, entity.record.data[f]]));
}

/**
 * Export form of a task.
 * @param view - View.
 * @param task - Task.
 * @returns The record.
 */
function exportTask(view: StoreView, task: IndexedEntity): Row {
  const comments = view
    .childrenOf(task.id)
    .filter((c) => c.type === 'comment')
    .sort(byCreation)
    .map((c) => ({ author: c.record.data['author'] ?? null, content: c.record.body, created_at: c.record.data['created_at'], is_deleted: c.deleted, ...pick(c, ['deleted_at', 'deleted_by', 'delete_reason']) }));
  return {
    _original_id: task.id,
    ...(text(task, 'story_id') === '' ? {} : { _original_story_id: text(task, 'story_id') }),
    title: text(task, 'title'),
    description: task.record.body,
    ...pick(task, TASK_FIELDS),
    tags: tagsOf(task),
    depends_on: idsIn(task, 'depends_on'),
    subtasks: subtasksOf(task).map((s) => ({ title: s.title, status: s.status, sort_order: s.sort_order })),
    comments,
  };
}

/**
 * Live tasks of a project grouped by epic (`''` = none), each group in manual order. One pass over
 * the tasks, so the cost does not grow with the number of epics.
 * @param view - View.
 * @param projectId - Project.
 * @returns Tasks by epic id.
 */
function tasksByEpic(view: StoreView, projectId: string): Map<string, IndexedEntity[]> {
  const groups = new Map<string, IndexedEntity[]>();
  for (const task of view.list('task', projectId)) {
    if (!task.deleted) {
      const epicId = text(task, 'epic_id');
      const group = groups.get(epicId) ?? [];
      group.push(task);
      groups.set(epicId, group);
    }
  }
  groups.forEach((group) => group.sort((a, b) => sortOrder(a) - sortOrder(b) || byCreation(a, b)));
  return groups;
}

/**
 * Export form of the project's notes and the unrelated ones.
 * @param view - View.
 * @param projectId - Project.
 * @returns Records.
 */
function exportNotes(view: StoreView, projectId: string): Row[] {
  return view
    .ofType('note')
    .filter((n) => !n.deleted && (n.projectId === projectId || text(n, 'related_entity_type') === ''))
    .sort(byCreation)
    .map((n) => ({ title: text(n, 'title'), content: n.record.body, note_type: text(n, 'note_type'), related_entity_type: n.record.data['related_entity_type'] ?? null, _original_related_entity_id: n.record.data['related_entity_id'] ?? null, tags: tagsOf(n) }));
}

/** Handles `tracker_export`. */
export class TrackerExportHandler implements OperationHandler<TrackerExportInput> {
  /**
   * Exports the scoped project (or the first one).
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The export.
   * @throws {WarlogError} `NOT_FOUND` when the store has no project or the project is unknown.
   */
  async handle(input: TrackerExportInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const scoped = resolveProjectScope(context, view, input.project_id);
    const project = scoped === undefined ? view.ofType('project')[0] : requireInView(view, 'project', scoped);
    if (project === undefined) {
      throw new WarlogError('NOT_FOUND', 'No projects found. Create a project first.', { type: 'project' });
    }
    const tasks = tasksByEpic(view, project.id);
    const epics = view
      .list('epic', project.id)
      .filter((e) => !e.deleted)
      .sort(byEpicOrder)
      .map((e) => ({ _original_id: e.id, name: text(e, 'name'), description: e.record.body, ...pick(e, ['status', 'priority', 'sort_order', 'branch']), tags: tagsOf(e), tasks: (tasks.get(e.id) ?? []).map((t) => exportTask(view, t)) }));
    const stories = view
      .list('story', project.id)
      .filter((s) => !s.deleted)
      .sort(byEpicOrder)
      .map((s) => ({ _original_id: s.id, ...(text(s, 'epic_id') === '' ? {} : { _original_epic_id: text(s, 'epic_id') }), title: text(s, 'title'), description: s.record.body, ...pick(s, ['code', 'status', 'priority', 'sort_order']), tags: tagsOf(s) }));
    return {
      kind: 'object',
      value: {
        format_version: '1.3',
        exported_at: context.clock.now().toISOString(),
        generator: 'warlog',
        project: { name: text(project, 'name'), description: project.record.body, status: text(project, 'status'), tags: tagsOf(project), epics, stories, tasks: (tasks.get('') ?? []).map((t) => exportTask(view, t)) },
        notes: exportNotes(view, project.id),
      },
    };
  }
}
