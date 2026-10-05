/**
 * Creates a task (`projects/<project>/tasks/<id>.md`).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { cleanDependencies, decideStatus } from './dependency-engine.ts';
import { transitionEvents } from './task-change.ts';
import type { TaskCreateInput } from './task-create.operation.ts';
import { unmetIn } from './task-graph.ts';

/** Where a new task lives. */
export interface Parent {
  /** Project. */
  readonly projectId: string;
  /** Epic, when any. */
  readonly epicId: string | undefined;
  /** Story, when any. */
  readonly storyId: string | undefined;
}

/** Optional input fields copied as given. */
const OPTIONAL_FIELDS = ['code', 'assigned_to', 'estimated_hours', 'due_date', 'source_ref'] as const;

/**
 * Resolves the parent epic and story of a new task (WL-12).
 * @param view - View.
 * @param input - Input.
 * @returns Project, epic and story.
 * @throws {WarlogError} `VALIDATION` without parent or with mismatched parents; `NOT_FOUND`.
 */
export function resolveParent(view: StoreView, input: Pick<TaskCreateInput, 'epic_id' | 'story_id'>): Parent {
  const epic = input.epic_id === undefined ? undefined : requireInView(view, 'epic', input.epic_id);
  const story = input.story_id === undefined ? undefined : requireInView(view, 'story', input.story_id);
  if (epic !== undefined) {
    assertStoryInEpic(epic, story);
    return { projectId: String(epic.projectId), epicId: epic.id, storyId: story?.id };
  }
  if (story === undefined) {
    throw new WarlogError('VALIDATION', 'epic_id or story_id is required', { field: 'epic_id' });
  }
  const storyEpic = story.record.data['epic_id'];
  return { projectId: String(story.projectId), epicId: typeof storyEpic === 'string' ? storyEpic : undefined, storyId: story.id };
}

/**
 * Fails when a story is not in an epic's project or belongs to another epic.
 * @param epic - Epic.
 * @param story - Story, when given.
 * @throws {WarlogError} `VALIDATION`.
 */
function assertStoryInEpic(epic: IndexedEntity, story: IndexedEntity | undefined): void {
  const storyEpic = story?.record.data['epic_id'];
  if (story !== undefined && (story.projectId !== epic.projectId || (typeof storyEpic === 'string' && storyEpic !== epic.id))) {
    throw new WarlogError('VALIDATION', `story ${story.id} does not belong to epic ${epic.id}`, { field: 'story_id' });
  }
}

/** Fields of a new task. */
export interface NewTask {
  /** Title. */
  readonly title: string;
  /** Status. */
  readonly status: string;
  /** Priority. */
  readonly priority: string;
  /** Tags. */
  readonly tags: readonly string[];
  /** Optional fields (code, assignee, estimate, dependencies, …). */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * Front matter of a new task.
 * @param parent - Project, epic and story.
 * @param task - Task fields.
 * @returns The fields.
 */
export function newTaskFields(parent: Parent, task: NewTask): Record<string, unknown> {
  return {
    project_id: parent.projectId,
    ...(parent.epicId === undefined ? {} : { epic_id: parent.epicId }),
    ...(parent.storyId === undefined ? {} : { story_id: parent.storyId }),
    title: task.title,
    status: task.status,
    priority: task.priority,
    depends_on: [],
    ...task.extra,
    description_locked: false,
    sort_order: 0,
    subtasks: [],
    tags: [...task.tags],
  };
}

/** Handles `task_create`. */
export class TaskCreateHandler implements OperationHandler<TaskCreateInput> {
  /** Writer factory. */
  private readonly writers: WriterFactory;

  /**
   * Creates the handler.
   * @param writers - Writer factory.
   */
  constructor(writers: WriterFactory) {
    this.writers = writers;
  }

  /**
   * Creates the task, blocked when a dependency is unfinished or missing (WL-13, WL-44).
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The task.
   * @throws {WarlogError} `VALIDATION`; `NOT_FOUND` for an unknown parent.
   */
  async handle(input: TaskCreateInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const parent = resolveParent(view, input);
    const id = context.ids.next();
    const dependsOn = cleanDependencies(id, input.depends_on ?? []);
    const unmet = unmetIn(view, dependsOn);
    const decision = decideStatus(input.status, dependsOn.length, unmet.length, false);
    const extra = Object.fromEntries(OPTIONAL_FIELDS.filter((f) => input[f] !== undefined).map((f) => [f, input[f]]));
    const fields = newTaskFields(parent, { title: input.title, status: decision.status, priority: input.priority, tags: input.tags ?? [], extra: { ...extra, depends_on: dependsOn, ...(unmet.length > 0 ? { blocked_by_deps: unmet } : {}) } });
    const record = await this.writers(context).create(
      { type: 'task', id, scope: 'repo', projectId: parent.projectId },
      fields,
      input.description ?? '',
      `Task '${input.title}' created`,
      transitionEvents(input.title, input.status, decision, unmet),
    );
    return { kind: 'object', value: entityRow(record) };
  }
}
