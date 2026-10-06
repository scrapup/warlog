import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure } from '../../../support/tracker-setup.ts';

describe.each(['lazy', 'live'] as const)('story operations (%s index)', (mode) => {
  it('[WL-12] story_create places a story between epic and tasks with defaults', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const story = await h.obj('story_create', { project_id: projectId, epic_id: epicId, title: 'Pay', code: 'US-12', description: 'As a buyer…' });
    expect(story).toMatchObject({ project_id: projectId, epic_id: epicId, title: 'Pay', code: 'US-12', status: 'planned', priority: 'medium', description: 'As a buyer…' });
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'created', entity_type: 'story', summary: "Story US-12 'Pay' created" });
    const free = await h.obj('story_create', { project_id: projectId, title: 'Loose' });
    expect(free).not.toHaveProperty('epic_id');
  });

  it('[WL-12] story codes are unique per project', async () => {
    const h = trackerHarness({ mode });
    const { projectId } = await container(h);
    const first = await h.obj('story_create', { project_id: projectId, title: 'A', code: 'US-1' });
    expect(isWarlogError(await failure(h.call('story_create', { project_id: projectId, title: 'B', code: 'US-1' })), 'VALIDATION')).toBe(true);
    const other = (await container(h)).projectId;
    expect(await h.obj('story_create', { project_id: other, title: 'C', code: 'US-1' })).toMatchObject({ code: 'US-1' });
    const second = await h.obj('story_create', { project_id: projectId, title: 'B', code: 'US-2' });
    expect(isWarlogError(await failure(h.call('story_update', { id: second['id'], code: 'US-1' })), 'VALIDATION')).toBe(true);
    expect(await h.obj('story_update', { id: first['id'], code: 'US-1', title: 'A2' })).toMatchObject({ code: 'US-1', title: 'A2' });
  });

  it('[WL-12] story parents must exist and the epic must belong to the project', async () => {
    const h = trackerHarness({ mode });
    const a = await container(h);
    const b = await container(h);
    expect(isWarlogError(await failure(h.call('story_create', { project_id: a.projectId, epic_id: b.epicId, title: 'X' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('story_create', { project_id: '01J00000000000000000000099', title: 'X' })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('story_create', { project_id: a.projectId, epic_id: '01J00000000000000000000099', title: 'X' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-12] story_get returns the story with its live tasks; story_list filters and counts', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const story = await h.obj('story_create', { project_id: projectId, epic_id: epicId, title: 'S', code: 'US-3' });
    const other = await h.obj('story_create', { project_id: projectId, title: 'Other', status: 'in_progress', priority: 'high' });
    const t1 = await h.obj('task_create', { story_id: story['id'], title: 'T1', code: 'TF-3-01' });
    await h.obj('task_create', { story_id: story['id'], title: 'T2' });
    await h.call('task_update', { id: t1['id'], status: 'done' });
    const got = await h.obj('story_get', { id: story['id'] });
    expect(got['tasks']).toEqual([
      { id: t1['id'], code: 'TF-3-01', title: 'T1', status: 'done', priority: 'medium' },
      expect.objectContaining({ title: 'T2', status: 'todo' }),
    ]);
    const rows = await h.rows('story_list', { project_id: projectId });
    expect(rows.find((r) => r['id'] === story['id'])).toMatchObject({ task_count: 2, done_count: 1, completion_pct: 50 });
    expect((await h.rows('story_list', { project_id: projectId, epic_id: epicId })).map((r) => r['id'])).toEqual([story['id']]);
    expect((await h.rows('story_list', { project_id: projectId, status: 'in_progress' })).map((r) => r['id'])).toEqual([other['id']]);
    expect((await h.rows('story_list', { project_id: projectId, priority: 'high' })).map((r) => r['id'])).toEqual([other['id']]);
    expect(isWarlogError(await failure(h.call('story_list', { project_id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-12] story_update records tracked changes and refuses an empty change', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const story = await h.obj('story_create', { project_id: projectId, title: 'S' });
    expect(await h.obj('story_update', { id: story['id'], status: 'in_progress', epic_id: epicId, description: 'N' })).toMatchObject({ status: 'in_progress', epic_id: epicId, description: 'N' });
    expect(h.activityRecords().slice(-2).map((r) => r['field'])).toEqual(['status', 'epic_id']);
    expect(isWarlogError(await failure(h.call('story_update', { id: story['id'] })), 'VALIDATION')).toBe(true);
  });

  it('[WL-12] story_archive hides a story from story_list and brings it back', async () => {
    const h = trackerHarness({ mode });
    const { projectId } = await container(h);
    const story = await h.obj('story_create', { project_id: projectId, title: 'S' });
    expect((await h.obj('story_archive', { id: story['id'] }))['message']).toBe(`Story ${String(story['id'])} is now archived.`);
    expect(await h.rows('story_list', { project_id: projectId })).toEqual([]);
    expect((await h.rows('story_list', { project_id: projectId, include_archived: true })).length).toBe(1);
    expect((await h.obj('story_archive', { id: story['id'] }))['message']).toBe(`Story ${String(story['id'])} is already archived.`);
    expect((await h.obj('story_archive', { id: story['id'], archived: false }))['message']).toBe(`Story ${String(story['id'])} is now active.`);
  });
});
