import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { tagsFrom } from '../../../../src/domain/tracker/saga-export.schema.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

/**
 * Builds a project with every kind of record.
 * @param h - Harness.
 * @returns The project id.
 */
async function richProject(h: TrackerHarness): Promise<string> {
  const { projectId, epicId } = await container(h, { branch: 'main', description: 'Epic body' });
  const story = await h.obj('story_create', { project_id: projectId, epic_id: epicId, title: 'S', code: 'US-1', description: 'As a user' });
  const a = await task(h, epicId, 'A', { story_id: story['id'], code: 'TF-1-01', description: 'body', estimated_hours: 1, source_ref: { file: 'a.ts' }, tags: ['x'] });
  const b = await task(h, epicId, 'B', { depends_on: [a['id']] });
  await h.call('subtask_create', { task_id: a['id'], titles: ['s1', 's2'] });
  const c = await h.obj('comment_add', { task_id: a['id'], content: 'kept', author: 'ana' });
  const gone = await h.obj('comment_add', { task_id: b['id'], content: 'removed' });
  await h.call('comment_delete', { id: gone['id'] });
  await h.call('task_lock_description', { id: a['id'] });
  const loose = await h.obj('story_create', { project_id: projectId, title: 'Loose' });
  await h.obj('task_create', { story_id: loose['id'], title: 'Epic-less' });
  await h.call('note_save', { title: 'On task', content: 'n1', related_entity_type: 'task', related_entity_id: a['id'], note_type: 'decision' });
  await h.call('note_save', { title: 'On epic', content: 'n2', related_entity_type: 'epic', related_entity_id: epicId });
  await h.call('note_save', { title: 'On project', content: 'n3', related_entity_type: 'project', related_entity_id: projectId });
  expect(c['id']).toBeDefined();
  return projectId;
}

/**
 * Removes exporter ids and dates so two exports can be compared.
 * @param value - Export.
 * @returns Normalized copy.
 */
function normalized(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (key, v: unknown) => (['_original_id', '_original_story_id', '_original_epic_id', '_original_related_entity_id', 'exported_at', 'created_at', 'deleted_at', 'depends_on'].includes(key) ? undefined : v));
}

describe('tracker export and import', () => {
  it('[WL-14] round trip warlog → warlog keeps every record and relation', async () => {
    const h = trackerHarness();
    const projectId = await richProject(h);
    const exported = await h.obj('tracker_export', { project_id: projectId });
    expect(exported).toMatchObject({ format_version: '1.3', generator: 'warlog', project: { name: 'p', epics: [{ name: 'E', branch: 'main' }], stories: [{ code: 'US-1' }, { title: 'Loose' }], tasks: [{ title: 'Epic-less' }] } });
    const result = await h.obj('tracker_import', { data: exported });
    expect(result).toMatchObject({ message: 'Import complete.', project_name: 'p', counts: { epics: 1, stories: 2, tasks: 3, subtasks: 2, comments: 2, dependencies: 1, notes: 3 } });
    const again = await h.obj('tracker_export', { project_id: result['project_id'] });
    expect(normalized(again)).toEqual(normalized(exported));
    const importedTasks = await h.rows('task_list', { project_id: result['project_id'] });
    const b = importedTasks.find((t) => t['title'] === 'B');
    const a = importedTasks.find((t) => t['title'] === 'A');
    expect(b?.['depends_on']).toEqual([a?.['id']]);
    expect(a).toMatchObject({ description_locked: true, code: 'TF-1-01', source_ref: { file: 'a.ts' } });
    const comments = await h.rows('comment_list', { task_id: b?.['id'], include_deleted: true });
    expect(comments).toEqual([expect.objectContaining({ content: 'removed', deleted_by: '' })]);
    const notes = await h.rows('note_list', { project_id: result['project_id'] });
    expect(notes.map((n) => [n['title'], n['related_entity_type']]).sort()).toEqual([
      ['On epic', 'epic'],
      ['On project', 'project'],
      ['On task', 'task'],
    ]);
  });

  it('[WL-14] imports an export of the current tracker: integer ids, JSON-text columns, nulls', async () => {
    const h = trackerHarness();
    const data = {
      format_version: '1.2',
      project: {
        name: 'saga',
        description: null,
        status: 'active',
        tags: '["a","b"]',
        metadata: '{}',
        epics: [
          {
            _original_id: 7,
            name: 'E',
            description: null,
            status: 'in_progress',
            priority: 'high',
            sort_order: 1,
            branch: null,
            tags: 'x, y',
            metadata: {},
            tasks: [
              { _original_id: 10, title: 'T10', description: null, status: 'done', priority: 'medium', sort_order: 0, source_ref: '{"file":"f.ts","line_start":3}', description_locked: 1, tags: '[]', depends_on: [], subtasks: [{ title: 'st', status: 'done', sort_order: 1 }], comments: [{ author: null, content: 'c', created_at: '2026-01-01 10:00:00', is_deleted: 0 }] },
              { _original_id: 11, title: 'T11', depends_on: [10, 99], source_ref: 'not json', tags: 'not json either' },
            ],
          },
        ],
      },
      notes: [
        { title: 'free', content: 'x', note_type: null, related_entity_type: null, _original_related_entity_id: null, tags: null },
        { title: 'lost', content: 'y', related_entity_type: 'task', _original_related_entity_id: 404 },
        { title: 'task', content: 'z', related_entity_type: 'task', _original_related_entity_id: 11 },
      ],
    };
    const result = await h.obj('tracker_import', { data });
    expect(result['counts']).toEqual({ epics: 1, stories: 0, tasks: 2, subtasks: 1, comments: 1, dependencies: 1, notes: 3 });
    const tasks = await h.rows('task_list', { project_id: result['project_id'], sort_by: 'created' });
    expect(tasks.map((t) => [t['title'], t['status']])).toEqual([
      ['T11', 'todo'],
      ['T10', 'done'],
    ]);
    expect(tasks[1]).toMatchObject({ source_ref: { file: 'f.ts', line_start: 3 }, description_locked: true, subtask_count: 1 });
    expect(tasks[0]).not.toHaveProperty('source_ref');
    expect(tasks[0]?.['tags']).toEqual(['not json either']);
    const notes = await h.rows('note_list');
    expect(notes.find((n) => n['title'] === 'lost')).not.toHaveProperty('related_entity_type');
    expect(notes.find((n) => n['title'] === 'task')).toMatchObject({ related_entity_id: tasks[0]?.['id'] });
    expect(await h.obj('tracker_dashboard', { project_id: result['project_id'] })).toMatchObject({ project: { name: 'saga', tags: ['a', 'b'] } });
  });

  it('[WL-14] a malformed export writes nothing and lists every invalid record', async () => {
    const h = trackerHarness();
    await container(h);
    const before = new Map(h.fs.files);
    const error = await failure(
      h.call('tracker_import', {
        data: { format_version: '1.3', project: { name: 'x', epics: [{ name: 'E', tasks: [{ title: '' }, { title: 'ok', status: 'finished' }] }] }, extra: true },
      }),
    );
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
    const issues = isWarlogError(error, 'VALIDATION') ? (error.details?.['issues'] as { path: string }[]) : [];
    expect(issues.map((i) => i.path).sort()).toEqual(['data.extra', 'data.project.epics.0.tasks.0.title', 'data.project.epics.0.tasks.1.status']);
    expect(new Map(h.fs.files)).toEqual(before);
    expect(isWarlogError(await failure(h.call('tracker_import', { data: { format_version: '2.0', project: { name: 'x' } } })), 'VALIDATION')).toBe(true);
  });

  it.each([
    ['a dependency cycle', { tasks: [{ _original_id: 1, title: 'A', depends_on: [2] }, { _original_id: 2, title: 'B', depends_on: [1] }] }, 'data.project.tasks', 'cycle'],
    ['a longer cycle', { tasks: [{ _original_id: 1, title: 'A', depends_on: [3] }, { _original_id: 2, title: 'B', depends_on: [1] }, { _original_id: 3, title: 'C', depends_on: [2] }] }, 'data.project.tasks', 'cycle'],
    ['a repeated task id', { tasks: [{ _original_id: 1, title: 'A' }, { _original_id: 1, title: 'B' }] }, 'data.project.tasks.1._original_id', 'duplicate'],
    ['a repeated epic id', { epics: [{ _original_id: 5, name: 'A' }, { _original_id: 5, name: 'B' }] }, 'data.project.epics.1._original_id', 'duplicate'],
    ['a repeated story id', { stories: [{ _original_id: 5, title: 'A' }, { _original_id: 5, title: 'B' }] }, 'data.project.stories.1._original_id', 'duplicate'],
  ])('[WL-14] an export with %s writes nothing', async (_name, content, path, word) => {
    const h = trackerHarness();
    await container(h);
    const before = new Map(h.fs.files);
    const error = await failure(h.call('tracker_import', { data: { format_version: '1.3', project: { name: 'x', ...content } } }));
    const issues = isWarlogError(error, 'VALIDATION') ? (error.details?.['issues'] as { path: string; message: string }[]) : [];
    expect(issues).toEqual([expect.objectContaining({ path, message: expect.stringContaining(word) as unknown as string })]);
    expect(new Map(h.fs.files)).toEqual(before);
  });

  it('[WL-14] an acyclic graph with a shared dependency and a self reference imports', async () => {
    const h = trackerHarness();
    await container(h);
    const tasks = [{ _original_id: 1, title: 'A', depends_on: [1, 2, 3] }, { _original_id: 2, title: 'B', depends_on: [3] }, { _original_id: 3, title: 'C' }];
    const result = await h.obj('tracker_import', { data: { format_version: '1.3', project: { name: 'dag', tasks } } });
    expect(result['counts']).toMatchObject({ tasks: 3, dependencies: 3 });
  });

  it('[WL-14] export picks WARLOG_PROJECT or the first project and fails on an empty store', async () => {
    const h = trackerHarness();
    expect(isWarlogError(await failure(h.call('tracker_export')), 'NOT_FOUND')).toBe(true);
    const a = await container(h);
    await container(h);
    expect(await h.obj('tracker_export')).toMatchObject({ project: { name: 'p', epics: [{ _original_id: a.epicId }] } });
  });

  it('reads tags from arrays, JSON text or comma lists', () => {
    expect(tagsFrom(['a'])).toEqual(['a']);
    expect(tagsFrom('["a", 1]')).toEqual(['a']);
    expect(tagsFrom('{"a":1}')).toEqual([]);
    expect(tagsFrom(' a , b ')).toEqual(['a', 'b']);
    expect(tagsFrom('')).toEqual([]);
    expect(tagsFrom(null)).toEqual([]);
  });
});
