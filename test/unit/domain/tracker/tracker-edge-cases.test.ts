import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, task } from '../../../support/tracker-setup.ts';

describe('tracker edge cases', () => {
  it('[WL-12] epic-less story tasks are ranked, listed and summarized without an epic', async () => {
    const h = trackerHarness();
    const { projectId, epicId } = await container(h, { branch: 'main' });
    const story = await h.obj('story_create', { project_id: projectId, title: 'Loose' });
    const loose = await h.obj('task_create', { story_id: story['id'], title: 'Loose task', status: 'blocked', due_date: '2026-09-02' });
    await task(h, epicId, 'Epic task', { due_date: '2026-09-01' });
    expect((await h.rows('task_list', { sort_by: 'manual' })).map((r) => r['title'])).toEqual(['Loose task', 'Epic task']);
    expect((await h.rows('task_list', { sort_by: 'due_date' })).map((r) => r['title'])).toEqual(['Epic task', 'Loose task']);
    const d = await h.obj('tracker_dashboard');
    expect(d['blocked_tasks']).toEqual([{ id: loose['id'], title: 'Loose task', priority: 'medium' }]);
    expect((d['overdue_tasks'] as Record<string, unknown>[]).map((t) => t['title'])).toEqual(['Epic task', 'Loose task']);
    expect((await h.obj('tracker_dashboard', { branch: 'main' }))['stats']).toMatchObject({ total_tasks: 1 });
    await h.call('task_update', { id: loose['id'], status: 'todo', priority: 'low' });
    const next = await h.obj('tracker_next');
    expect(next['alternatives']).toEqual([expect.objectContaining({ title: 'Loose task', why_not_first: 'overdue since 2026-09-02' })]);
    const got = await h.obj('task_get', { id: loose['id'] });
    expect(got).not.toHaveProperty('epic_name');
  });

  it('[WL-13] tracker_next names the unfinished task holding most blocked ones', async () => {
    const h = trackerHarness();
    const { epicId } = await container(h);
    const g1 = await task(h, epicId, 'g1', { depends_on: ['01J00000000000000000000098'] });
    const g2 = await task(h, epicId, 'g2', { depends_on: ['01J00000000000000000000099'] });
    await task(h, epicId, 'x', { depends_on: [g1['id'], g2['id']] });
    await task(h, epicId, 'y', { depends_on: [g2['id']] });
    const next = await h.obj('tracker_next');
    expect(String(next['summary'])).toContain(`Unblocking ${String(g2['id'])} 'g2' would release 2 of them.`);
  });

  it('[WL-13] a dependent already reflecting its dependencies is not rewritten', async () => {
    const h = trackerHarness();
    const { projectId, epicId } = await container(h);
    const a = await task(h, epicId, 'A', { status: 'done' });
    const b = await task(h, epicId, 'B', { depends_on: [a['id']], status: 'done' });
    const path = join(String(h.roots.repository?.root), 'projects', projectId, 'tasks', `${String(b['id'])}.md`);
    h.fs.files.set(path, String(h.fs.files.get(path)).replace('rev: 1', `rev: 1\nblocked_by_deps:\n  - ${String(a['id'])}`));
    await h.call('task_update', { id: a['id'], status: 'todo' });
    expect(await h.obj('task_get', { id: b['id'] })).toMatchObject({ rev: 1, status: 'done' });
  });

  it('[WL-10] lists with several entries keep their documented order', async () => {
    const h = trackerHarness();
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    await h.call('note_save', { title: 'first', content: '', related_entity_type: 'task', related_entity_id: t['id'] });
    h.clock.advance(1);
    await h.call('note_save', { title: 'second', content: 'x', related_entity_type: 'task', related_entity_id: t['id'] });
    expect(((await h.obj('task_get', { id: t['id'] }))['notes'] as Record<string, unknown>[]).map((n) => n['title'])).toEqual(['second', 'first']);
    expect((await h.rows('note_list')).find((n) => n['title'] === 'first')).not.toHaveProperty('excerpt');
    await h.call('template_create', { name: 'a', tasks: [{ title: 'x' }] });
    await h.call('template_create', { name: 'b', tasks: [{ title: 'y' }] });
    expect((await h.rows('template_list')).map((r) => r['name'])).toEqual(['b', 'a']);
    const before = await h.rows('task_reorder', { epic_id: epicId, ordered_ids: [t['id']] });
    expect(await h.rows('task_reorder', { epic_id: epicId, ordered_ids: [t['id']] })).toEqual(before);
    expect(((await h.obj('tracker_search', { query: 'T', entity_types: ['task'] }))['tasks'] as Record<string, unknown>[])[0]).not.toHaveProperty('excerpt');
  });

  it('[WL-10] session diff counts actions beyond the base four', async () => {
    const h = trackerHarness();
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    await h.call('task_delete', { id: t['id'] });
    await h.call('task_restore', { id: t['id'] });
    const diff = await h.obj('tracker_session_diff', { since: '2026-01-01' });
    expect(diff['summary']).toMatchObject({ deleted: 1, restored: 1 });
    expect(diff['by_entity_type']).toMatchObject({ task: { restored: 1 } });
  });

  it('[WL-10] activity of a store without repository is read from the global root', async () => {
    const h = trackerHarness({ withRepository: false });
    await h.call('template_create', { name: 'g', tasks: [{ title: 'x' }] });
    expect((await h.rows('activity_log')).map((r) => r['entity_type'])).toEqual(['template']);
  });
});

describe('tracker edge cases (more)', () => {
  it('[WL-43] the dashboard flags a repository without remote; overdue ties keep both', async () => {
    const h = trackerHarness();
    h.contextWarnings = ['repo.local_scope'];
    const { epicId } = await container(h);
    await task(h, epicId, 'a', { due_date: '2026-09-01' });
    await task(h, epicId, 'b', { due_date: '2026-09-01' });
    const d = await h.obj('tracker_dashboard');
    expect(d['store_warnings']).toEqual({ local_scope: true });
    expect((d['overdue_tasks'] as unknown[]).length).toBe(2);
  });

  it('[WL-13] tracker_next skips subtasks waiting on unfinished siblings and explains a plain pick', async () => {
    const h = trackerHarness();
    const { projectId } = await container(h);
    const story = await h.obj('story_create', { project_id: projectId, title: 'S' });
    const t = await h.obj('task_create', { story_id: story['id'], title: 'Plain' });
    const created = await h.obj('subtask_create', { task_id: t['id'], titles: ['a', 'b', 'c'] });
    const [a, b, c] = (created['subtasks'] as { id: string }[]).map((s) => s.id);
    await h.call('subtask_update', { id: b, depends_on: [c] });
    await h.call('subtask_update', { id: a, status: 'done' });
    const next = await h.obj('tracker_next');
    expect(next).toMatchObject({ reason: "next in '(no epic)'", next_subtask: { id: c }, open_subtasks: 2 });
  });

  it('[WL-14] export keeps notes related to nothing', async () => {
    const h = trackerHarness();
    await container(h);
    await h.call('note_save', { title: 'free', content: 'x' });
    expect((await h.obj('tracker_export'))['notes']).toEqual([{ title: 'free', content: 'x', note_type: 'general', related_entity_type: null, _original_related_entity_id: null, tags: [] }]);
  });
});
