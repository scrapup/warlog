/**
 * Plans a `tracker_import` (WL-14): new ids for every record of a validated export, references
 * remapped (dependencies to unknown ids are dropped, as the current tracker does; notes whose
 * related entity is unknown lose the relation), before anything is written.
 */
import type { IdGenerator } from '../../core/ports/id-generator.port.ts';
import type { DeletionInfo } from '../../core/storage/entity-file-repository.ts';
import { tagsFrom } from './saga-export.schema.ts';
import type { ExportEpic, ExportNote, ExportStory, ExportTask, SagaExport } from './saga-export.schema.ts';

/** An entity to create. */
export interface PlannedEntity {
  /** New id. */
  readonly id: string;
  /** Front-matter fields. */
  readonly fields: Record<string, unknown>;
  /** Body. */
  readonly body: string;
  /** Label for the activity summary. */
  readonly label: string;
}

/** A comment to create. */
export interface PlannedComment extends PlannedEntity {
  /** New task id. */
  readonly taskId: string;
  /** Who removed it and why, when it was removed in the export. */
  readonly deletion: DeletionInfo | undefined;
}

/** Everything to write. */
export interface ImportPlan {
  /** Project. */
  readonly project: PlannedEntity;
  /** Epics. */
  readonly epics: PlannedEntity[];
  /** Stories. */
  readonly stories: PlannedEntity[];
  /** Tasks (subtasks embedded). */
  readonly tasks: PlannedEntity[];
  /** Comments. */
  readonly comments: PlannedComment[];
  /** Notes. */
  readonly notes: PlannedEntity[];
  /** Counts for the result. */
  readonly counts: Record<string, number>;
}

/** Maps from exporter ids to new ids. */
interface IdMaps {
  /** Epics. */
  readonly epics: Map<string, string>;
  /** Stories. */
  readonly stories: Map<string, string>;
  /** Tasks. */
  readonly tasks: Map<string, string>;
}

/**
 * Drops `null`/`undefined` values.
 * @param fields - Fields.
 * @returns The defined fields.
 */
function defined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));
}

/**
 * Source reference of a task (object, or the JSON text of one).
 * @param value - Export value.
 * @returns The object, when readable.
 */
function sourceRef(value: ExportTask['source_ref']): Record<string, unknown> | undefined {
  if (typeof value !== 'string') {
    return value ?? undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Plans the import.
 * @param data - Validated export.
 * @param ids - Id generator.
 * @param now - Import date (subtask dates).
 * @returns The plan.
 */
export function planImport(data: SagaExport, ids: IdGenerator, now: string): ImportPlan {
  const p = data.project;
  const projectId = ids.next();
  const maps: IdMaps = { epics: new Map(), stories: new Map(), tasks: new Map() };
  const epicTasks = (p.epics ?? []).map((epic) => ({ epic, id: remember(maps.epics, epic._original_id, ids.next()) }));
  const stories = (p.stories ?? []).map((story) => ({ story, id: remember(maps.stories, story._original_id, ids.next()) }));
  const allTasks = [...epicTasks.flatMap(({ epic, id }) => (epic.tasks ?? []).map((task) => ({ task, epicId: id as string | undefined }))), ...(p.tasks ?? []).map((task) => ({ task, epicId: undefined }))].map((t) => ({
    ...t,
    id: remember(maps.tasks, t.task._original_id, ids.next()),
  }));
  const project: PlannedEntity = { id: projectId, fields: { name: p.name, status: p.status ?? 'active', tags: tagsFrom(p.tags) }, body: p.description ?? '', label: `Project '${p.name}'` };
  const tasks = allTasks.map(({ task, epicId, id }) => plannedTask(task, { id, projectId, epicId, maps, ids, now }));
  const comments = allTasks.flatMap(({ task, id }) => plannedComments(task, id, projectId, ids));
  const notes = (data.notes ?? []).map((note) => plannedNote(note, projectId, maps, ids));
  const dependencies = tasks.reduce((n, t) => n + (t.fields['depends_on'] as string[]).length, 0);
  return {
    project,
    epics: epicTasks.map(({ epic, id }) => plannedEpic(epic, id, projectId)),
    stories: stories.map(({ story, id }) => plannedStory(story, id, projectId, maps)),
    tasks,
    comments,
    notes,
    counts: { epics: epicTasks.length, stories: stories.length, tasks: tasks.length, subtasks: tasks.reduce((n, t) => n + (t.fields['subtasks'] as unknown[]).length, 0), comments: comments.length, dependencies, notes: notes.length },
  };
}

/**
 * Records an exporter id.
 * @param map - Id map.
 * @param original - Exporter id.
 * @param id - New id.
 * @returns The new id.
 */
function remember(map: Map<string, string>, original: string | number | null | undefined, id: string): string {
  if (original !== undefined && original !== null) {
    map.set(String(original), id);
  }
  return id;
}

/**
 * Plans an epic.
 * @param epic - Export epic.
 * @param id - New id.
 * @param projectId - New project id.
 * @returns The entity.
 */
function plannedEpic(epic: ExportEpic, id: string, projectId: string): PlannedEntity {
  const fields = defined({ project_id: projectId, name: epic.name, status: epic.status ?? 'planned', priority: epic.priority ?? 'medium', branch: epic.branch, sort_order: epic.sort_order ?? 0, archived: false, tags: tagsFrom(epic.tags) });
  return { id, fields, body: epic.description ?? '', label: `Epic '${epic.name}'` };
}

/**
 * Plans a story.
 * @param story - Export story.
 * @param id - New id.
 * @param projectId - New project id.
 * @param maps - Id maps.
 * @returns The entity.
 */
function plannedStory(story: ExportStory, id: string, projectId: string, maps: IdMaps): PlannedEntity {
  const epicId = story._original_epic_id === undefined || story._original_epic_id === null ? undefined : maps.epics.get(String(story._original_epic_id));
  const fields = defined({ project_id: projectId, epic_id: epicId, title: story.title, code: story.code, status: story.status ?? 'planned', priority: story.priority ?? 'medium', sort_order: story.sort_order ?? 0, archived: false, tags: tagsFrom(story.tags) });
  return { id, fields, body: story.description ?? '', label: `Story '${story.title}'` };
}

/** Where a planned task goes. */
interface TaskPlace {
  /** New id. */
  readonly id: string;
  /** New project id. */
  readonly projectId: string;
  /** New epic id. */
  readonly epicId: string | undefined;
  /** Id maps. */
  readonly maps: IdMaps;
  /** Id generator (subtasks). */
  readonly ids: IdGenerator;
  /** Import date. */
  readonly now: string;
}

/**
 * Plans a task with its subtasks and remapped dependencies.
 * @param task - Export task.
 * @param place - Ids and maps.
 * @returns The entity.
 */
function plannedTask(task: ExportTask, place: TaskPlace): PlannedEntity {
  const storyId = task._original_story_id === undefined || task._original_story_id === null ? undefined : place.maps.stories.get(String(task._original_story_id));
  const dependsOn = (task.depends_on ?? []).map((d) => place.maps.tasks.get(String(d))).filter((d): d is string => d !== undefined && d !== place.id);
  const subtasks = (task.subtasks ?? []).map((s, i) => ({ id: place.ids.next(), title: s.title, status: s.status ?? 'todo', sort_order: s.sort_order ?? i + 1, created_at: place.now, updated_at: place.now }));
  const fields = defined({
    project_id: place.projectId,
    epic_id: place.epicId,
    story_id: storyId,
    title: task.title,
    code: task.code,
    status: task.status ?? 'todo',
    priority: task.priority ?? 'medium',
    assigned_to: task.assigned_to,
    estimated_hours: task.estimated_hours,
    actual_hours: task.actual_hours,
    due_date: task.due_date,
    source_ref: sourceRef(task.source_ref),
    depends_on: [...new Set(dependsOn)],
    description_locked: task.description_locked === true || task.description_locked === 1,
    sort_order: task.sort_order ?? 0,
    subtasks,
    tags: tagsFrom(task.tags),
  });
  return { id: place.id, fields, body: task.description ?? '', label: `Task '${task.title}'` };
}

/**
 * Plans the comments of a task.
 * @param task - Export task.
 * @param taskId - New task id.
 * @param projectId - New project id.
 * @param ids - Id generator.
 * @returns The comments.
 */
function plannedComments(task: ExportTask, taskId: string, projectId: string, ids: IdGenerator): PlannedComment[] {
  return (task.comments ?? []).map((c) => ({
    id: ids.next(),
    taskId,
    deletion: c.is_deleted === true || c.is_deleted === 1 ? { by: c.deleted_by ?? 'import', reason: c.delete_reason ?? 'removed in the export' } : undefined,
    fields: defined({ project_id: projectId, task_id: taskId, author: c.author, original_created_at: c.created_at }),
    body: c.content,
    label: 'Comment',
  }));
}

/**
 * Plans a note with its relation remapped.
 * @param note - Export note.
 * @param projectId - New project id.
 * @param maps - Id maps.
 * @param ids - Id generator.
 * @returns The entity (stored in the project).
 */
function plannedNote(note: ExportNote, projectId: string, maps: IdMaps, ids: IdGenerator): PlannedEntity {
  const original = note._original_related_entity_id === undefined || note._original_related_entity_id === null ? undefined : String(note._original_related_entity_id);
  const relatedMaps: Record<string, Map<string, string> | undefined> = { epic: maps.epics, task: maps.tasks };
  const type = note.related_entity_type ?? undefined;
  const related = type === 'project' ? projectId : type === undefined || original === undefined ? undefined : relatedMaps[type]?.get(original);
  const fields = defined({ project_id: projectId, title: note.title, note_type: note.note_type ?? 'general', related_entity_type: related === undefined ? undefined : type, related_entity_id: related, tags: tagsFrom(note.tags) });
  return { id: ids.next(), fields, body: note.content, label: `Note '${note.title}'` };
}
