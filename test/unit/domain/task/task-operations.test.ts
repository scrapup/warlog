import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, statusOf, task } from '../../../support/tracker-setup.ts';

describe.each(['lazy', 'live'] as const)('task operations (%s index)', (mode) => {
  it('[WL-10] task_create applies saga defaults and stores optional fields', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const t = await task(h, epicId, 'T', {
      description: 'Body',
      assigned_to: 'agent',
      estimated_hours: 2,
      due_date: '2026-10-10',
      source_ref: { file: 'src/a.ts', line_start: 3 },
      tags: ['x'],
      code: 'TF-1-01',
    });
    expect(t).toMatchObject({ project_id: projectId, epic_id: epicId, title: 'T', status: 'todo', priority: 'medium', assigned_to: 'agent', estimated_hours: 2, due_date: '2026-10-10', source_ref: { file: 'src/a.ts', line_start: 3 }, tags: ['x'], code: 'TF-1-01', description_locked: false, subtasks: [], depends_on: [], description: 'Body' });
  });

  it('[WL-12] task_create accepts a story without an epic and inherits the story epic', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const loose = await h.obj('story_create', { project_id: projectId, title: 'Loose' });
    const bound = await h.obj('story_create', { project_id: projectId, epic_id: epicId, title: 'Bound' });
    const t1 = await h.obj('task_create', { story_id: loose['id'], title: 'T1' });
    expect(t1).toMatchObject({ project_id: projectId, story_id: loose['id'] });
    expect(t1).not.toHaveProperty('epic_id');
    expect(await h.obj('task_create', { story_id: bound['id'], title: 'T2' })).toMatchObject({ epic_id: epicId, story_id: bound['id'] });
    expect(await h.obj('task_create', { epic_id: epicId, story_id: bound['id'], title: 'T3' })).toMatchObject({ epic_id: epicId });
    expect(isWarlogError(await failure(h.call('task_create', { title: 'orphan' })), 'VALIDATION')).toBe(true);
    const other = await container(h);
    expect(isWarlogError(await failure(h.call('task_create', { epic_id: other.epicId, story_id: bound['id'], title: 'X' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-11] task ids are strings; integer ids are rejected', async () => {
    const h = trackerHarness({ mode });
    expect(isWarlogError(await failure(h.call('task_get', { id: 12 })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('task_get', { id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-10] task_get returns subtasks, notes, comments and the epic name', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    const got = await h.obj('task_get', { id: t['id'] });
    expect(got).toMatchObject({ epic_name: 'E', subtasks: [], notes: [], comments: [], depends_on: [], dependents: [] });
  });

  it('[WL-10] task_update changes fields, records tracked changes and refuses an empty change', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    const updated = await h.obj('task_update', { id: t['id'], status: 'in_progress', priority: 'high', actual_hours: 1.5, description: 'New' });
    expect(updated).toMatchObject({ status: 'in_progress', priority: 'high', actual_hours: 1.5, description: 'New', rev: 2 });
    expect(h.activityRecords().slice(-2).map((r) => [r['action'], r['field'], r['new_value']])).toEqual([
      ['status_changed', 'status', 'in_progress'],
      ['updated', 'priority', 'high'],
    ]);
    expect(isWarlogError(await failure(h.call('task_update', { id: t['id'] })), 'VALIDATION')).toBe(true);
  });

  it('[WL-10] a locked description refuses changes while other fields stay editable', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    expect((await h.obj('task_lock_description', { id: t['id'] }))['message']).toContain('is locked');
    expect((await h.obj('task_lock_description', { id: t['id'] }))['message']).toBe(`Task ${String(t['id'])}'s description is already locked.`);
    expect(isWarlogError(await failure(h.call('task_update', { id: t['id'], description: 'rewrite' })), 'VALIDATION')).toBe(true);
    expect(await h.obj('task_update', { id: t['id'], priority: 'low' })).toMatchObject({ priority: 'low' });
    expect((await h.obj('task_lock_description', { id: t['id'], locked: false }))['message']).toBe(`Task ${String(t['id'])}'s description is unlocked.`);
    expect(await h.obj('task_update', { id: t['id'], description: 'ok' })).toMatchObject({ description: 'ok' });
  });

  it('[WL-08] task_delete removes only todo tasks nothing depends on; task_restore brings them back', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = await task(h, epicId, 'A');
    const b = await task(h, epicId, 'B', { depends_on: [a['id']] });
    const started = await task(h, epicId, 'S', { status: 'in_progress' });
    expect(isWarlogError(await failure(h.call('task_delete', { id: a['id'] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('task_delete', { id: started['id'] })), 'VALIDATION')).toBe(true);
    await h.call('task_update', { id: b['id'], depends_on: [] });
    const removed = await h.obj('task_delete', { id: a['id'], reason: 'dup', deleted_by: 'me' });
    expect(removed['task']).toMatchObject({ deleted_by: 'me', delete_reason: 'dup', deleted_at: '2026-10-03T12:00:00.000Z' });
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'deleted', summary: "Task 'A' removed by me: dup" });
    expect((await h.obj('task_delete', { id: a['id'] }))['message']).toBe(`Task ${String(a['id'])} was already removed.`);
    expect((await h.rows('task_list', { epic_id: epicId })).map((r) => r['title'])).not.toContain('A');
    expect((await h.rows('task_list', { epic_id: epicId, include_deleted: true })).map((r) => r['title'])).toContain('A');
    const restored = await h.obj('task_restore', { id: a['id'] });
    expect(restored['message']).toBe(`Task ${String(a['id'])} restored.`);
    expect(restored['task']).not.toHaveProperty('deleted_at');
    expect((await h.obj('task_restore', { id: a['id'] }))['message']).toBe(`Task ${String(a['id'])} is not removed — nothing to restore.`);
  });

  it('[WL-10] completing a task with unfinished subtasks needs force, which is flagged in activity', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    await h.call('subtask_create', { task_id: t['id'], titles: ['one'] });
    expect(isWarlogError(await failure(h.call('task_update', { id: t['id'], status: 'done' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('task_batch_update', { ids: [t['id']], status: 'done' })), 'VALIDATION')).toBe(true);
    expect(await h.obj('task_update', { id: t['id'], status: 'done', force: true })).toMatchObject({ status: 'done' });
    expect(h.activityRecords().at(-1)).toMatchObject({ forced: true, summary: expect.stringContaining("Task 'T' forced to done with 1 unfinished subtask(s)") });
  });

  it('[WL-13] task_batch_update applies fields to every task and releases dependents', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = await task(h, epicId, 'A');
    const b = await task(h, epicId, 'B');
    const c = await task(h, epicId, 'C', { depends_on: [a['id'], b['id']] });
    const result = await h.obj('task_batch_update', { ids: [a['id'], b['id']], status: 'done', assigned_to: 'me' });
    expect(result['updated']).toBe(2);
    expect(await statusOf(h, c['id'])).toBe('todo');
    expect(isWarlogError(await failure(h.call('task_batch_update', { ids: [a['id']] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('task_batch_update', { ids: ['01J00000000000000000000099'], priority: 'low' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-13] task_batch_update writes nothing when any id is unknown or has unfinished subtasks', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const ok = await task(h, epicId, 'OK');
    const open = await task(h, epicId, 'OPEN');
    await h.call('subtask_create', { task_id: open['id'], titles: ['one'] });
    const before = new Map(h.fs.files);
    const missing = await failure(h.call('task_batch_update', { ids: [ok['id'], '01J00000000000000000000099'], status: 'done' }));
    expect(isWarlogError(missing, 'NOT_FOUND')).toBe(true);
    const unfinished = await failure(h.call('task_batch_update', { ids: [ok['id'], open['id']], status: 'done' }));
    expect(isWarlogError(unfinished, 'VALIDATION')).toBe(true);
    expect(new Map(h.fs.files)).toEqual(before);
    expect(await statusOf(h, ok['id'])).toBe('todo');
    expect(await h.obj('task_batch_update', { ids: [ok['id'], open['id'], ok['id']], status: 'done', force: true })).toMatchObject({ updated: 2 });
  });

  it('[WL-10] task_reorder sets positions, keeps unlisted tasks after, and task_list follows it', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = await task(h, epicId, 'A', { priority: 'low' });
    const b = await task(h, epicId, 'B', { priority: 'critical' });
    const c = await task(h, epicId, 'C');
    expect((await h.rows('task_list', { epic_id: epicId })).map((r) => r['title'])).toEqual(['B', 'C', 'A']);
    const rows = await h.rows('task_reorder', { epic_id: epicId, ordered_ids: [a['id'], c['id']] });
    expect(rows.map((r) => [r['title'], r['sort_order']])).toEqual([
      ['A', 1],
      ['C', 2],
      ['B', 3],
    ]);
    expect((await h.rows('task_list', { epic_id: epicId })).map((r) => r['title'])).toEqual(['A', 'C', 'B']);
    expect((await h.rows('task_list', { epic_id: epicId, sort_by: 'priority' })).map((r) => r['title'])).toEqual(['B', 'C', 'A']);
    expect(isWarlogError(await failure(h.call('task_reorder', { epic_id: epicId, ordered_ids: ['01J00000000000000000000099'] })), 'VALIDATION')).toBe(true);
    const empty = await h.obj('epic_create', { project_id: String((await h.obj('task_get', { id: a['id'] }))['project_id']), name: 'Empty' });
    expect(isWarlogError(await failure(h.call('task_reorder', { epic_id: empty['id'], ordered_ids: [] })), 'VALIDATION')).toBe(true);
    expect(b['id']).toBeDefined();
  });

  it('[WL-10] task_list filters, sorts and limits like the current tracker', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h, { branch: 'main' });
    const other = await h.obj('epic_create', { project_id: projectId, name: 'Other' });
    await task(h, epicId, 'A', { priority: 'high', assigned_to: 'ana', tags: ['ui'], due_date: '2026-10-09' });
    await task(h, epicId, 'B', { status: 'in_progress', due_date: '2026-10-01' });
    await task(h, String(other['id']), 'C', { status: 'blocked' });
    const titles = async (input: Record<string, unknown>): Promise<unknown[]> => (await h.rows('task_list', input)).map((r) => r['title']);
    expect(await titles({ status: 'in_progress' })).toEqual(['B']);
    expect(await titles({ priority: 'high' })).toEqual(['A']);
    expect(await titles({ assigned_to: 'ana' })).toEqual(['A']);
    expect(await titles({ tag: 'ui' })).toEqual(['A']);
    expect(await titles({ branch: 'current' })).toEqual(['A', 'B']);
    expect(await titles({ branch: '' })).toEqual(['C']);
    expect(await titles({ sort_by: 'status' })).toEqual(['C', 'B', 'A']);
    expect(await titles({ sort_by: 'due_date' })).toEqual(['B', 'A', 'C']);
    expect(await titles({ sort_by: 'created' })).toEqual(['C', 'B', 'A']);
    expect(await titles({ sort_by: 'manual' })).toEqual(['A', 'B', 'C']);
    expect(await titles({ limit: 1, sort_by: 'created' })).toEqual(['C']);
    await h.call('epic_archive', { id: other['id'] });
    expect(await titles({ sort_by: 'created' })).toEqual(['B', 'A']);
    expect(await titles({ sort_by: 'created', include_archived: true })).toEqual(['C', 'B', 'A']);
    expect((await h.rows('task_list', { epic_id: epicId }))[0]).toMatchObject({ epic_name: 'E', subtask_count: 0, subtask_done_count: 0, blocked_by_count: 0 });
  });

  it('[WL-10] task_list scopes by project_id or WARLOG_PROJECT (id or name)', async () => {
    const h = trackerHarness({ mode });
    const a = await container(h);
    const b = await container(h);
    await task(h, a.epicId, 'in A');
    await task(h, b.epicId, 'in B');
    expect((await h.rows('task_list', { project_id: a.projectId })).map((r) => r['title'])).toEqual(['in A']);
    h.defaultProject = b.projectId;
    expect((await h.rows('task_list')).map((r) => r['title'])).toEqual(['in B']);
    h.defaultProject = 'P';
    expect((await h.rows('task_list')).length).toBe(1);
    h.defaultProject = 'nope';
    expect(isWarlogError(await failure(h.call('task_list')), 'VALIDATION')).toBe(true);
    h.defaultProject = undefined;
    expect(isWarlogError(await failure(h.call('task_list', { project_id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
  });
});
