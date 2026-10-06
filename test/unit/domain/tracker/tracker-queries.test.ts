import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

describe.each(['lazy', 'live'] as const)('tracker queries (%s index)', (mode) => {
  it('[WL-10] tracker_dashboard summarizes the project with stats, attention lists and recent work', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h, { status: 'in_progress' });
    await h.obj('epic_create', { project_id: projectId, name: 'Later' });
    const a = await task(h, epicId, 'A', { estimated_hours: 2, due_date: '2026-10-01' });
    await task(h, epicId, 'B', { depends_on: [a['id']], priority: 'high' });
    await task(h, epicId, 'C', { status: 'in_progress' });
    await h.call('note_save', { title: 'N', content: 'x', related_entity_type: 'project', related_entity_id: projectId });
    const d = await h.obj('tracker_dashboard');
    expect(d['summary']).toBe("p: 3 tasks across 2 epics. 0% complete. Active: E (0/3 done). Next up: Later (0 tasks). 1 blocked task(s). 1 overdue task(s). 1 in progress.");
    expect(d['stats']).toEqual({ total_epics: 2, total_tasks: 3, tasks_done: 0, tasks_in_progress: 1, tasks_blocked: 1, tasks_todo: 1, tasks_review: 0, total_estimated_hours: 2, total_actual_hours: 0, completion_pct: 0 });
    expect(d['blocked_tasks']).toEqual([expect.objectContaining({ title: 'B', priority: 'high', epic_name: 'E' })]);
    expect(d['overdue_tasks']).toEqual([expect.objectContaining({ title: 'A', due_date: '2026-10-01' })]);
    expect((d['recent_activity'] as unknown[]).length).toBe(8);
    expect(d['recent_notes']).toEqual([expect.objectContaining({ title: 'N', note_type: 'general' })]);
    expect(d['branch_scope']).toBeNull();
    expect(d).not.toHaveProperty('store_warnings');
  });

  it('[WL-10] tracker_dashboard reports hidden items, other projects and branch scope', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h, { branch: 'main' });
    await container(h);
    const t = await task(h, epicId, 'gone');
    await h.call('task_delete', { id: t['id'] });
    const archived = await h.obj('epic_create', { project_id: projectId, name: 'Old' });
    await h.call('epic_archive', { id: archived['id'] });
    const d = await h.obj('tracker_dashboard', { branch: 'current' });
    expect(d).toMatchObject({ archived_epic_count: 1, removed_task_count: 1, branch_scope: 'main' });
    expect(d['other_projects']).toHaveLength(1);
    expect(String(d['summary'])).toContain('Hidden: 1 archived epic(s) and 1 removed task(s)');
    expect(String(d['summary'])).toContain("this store holds 2 projects and none was specified — showing 'p'");
    const all = await h.obj('tracker_dashboard', { project_id: projectId, include_archived: true, branch: '' });
    expect(all['branch_scope']).toBe('(branch-agnostic)');
    expect(all).not.toHaveProperty('other_projects');
    expect(String(all['summary'])).not.toContain('Hidden');
  });

  it('[WL-10] tracker_dashboard on an empty store asks to create a project', async () => {
    const h = trackerHarness({ mode });
    expect(await h.obj('tracker_dashboard')).toEqual({ message: 'No projects found. Use tracker_init or project_create to get started.', projects: [] });
  });

  it('[WL-13] tracker_next never recommends a blocked task and explains its choice', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h, { status: 'in_progress' });
    const a = await task(h, epicId, 'A', { priority: 'low' });
    const b = await task(h, epicId, 'B', { priority: 'critical', depends_on: [a['id']] });
    await h.call('subtask_create', { task_id: a['id'], titles: ['first', 'second'] });
    const next = await h.obj('tracker_next');
    expect(next).toMatchObject({ task: { id: a['id'] }, reason: "in the active epic 'E'", next_subtask: { title: 'first' }, open_subtasks: 2 });
    expect(next['blocked']).toEqual([{ id: b['id'], title: 'B', waiting_on: [{ id: a['id'], title: 'A', status: 'todo' }] }]);
    expect(String(next['summary'])).toBe(`Work on ${String(a['id'])} 'A' — in the active epic 'E'. Next step: first. 1 other task(s) are blocked.`);
    await h.call('task_update', { id: a['id'], status: 'done', force: true });
    expect(await h.obj('tracker_next')).toMatchObject({ task: { id: b['id'] }, reason: "critical priority, in the active epic 'E'" });
  });

  it('[WL-13] tracker_next ranks started, overdue and due work first and lists alternatives', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    await task(h, epicId, 'plain');
    await task(h, epicId, 'due', { due_date: '2026-12-01' });
    await task(h, epicId, 'late', { due_date: '2026-09-01' });
    await task(h, epicId, 'review', { status: 'review' });
    await task(h, epicId, 'mine', { status: 'in_progress', assigned_to: 'ana' });
    const next = await h.obj('tracker_next');
    expect(next['reason']).toBe('already in progress');
    expect((next['alternatives'] as Record<string, unknown>[]).map((a) => [a['title'], a['why_not_first']])).toEqual([
      ['review', 'waiting on review'],
      ['late', 'overdue since 2026-09-01'],
      ['due', 'due 2026-12-01'],
    ]);
    expect(next['overdue']).toEqual([expect.objectContaining({ title: 'late' })]);
    expect(String(next['summary'])).toContain("Also overdue: ");
    expect(await h.obj('tracker_next', { assigned_to: 'nobody' })).toEqual({ summary: 'Nothing left to do — every task is done, removed, or in an archived epic.', task: null });
  });

  it('[WL-13] tracker_next names the dependency that would release most blocked tasks', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const gate = await task(h, epicId, 'gate', { depends_on: ['01J00000000000000000000099'] });
    await task(h, epicId, 'x', { depends_on: [gate['id']] });
    const next = await h.obj('tracker_next');
    expect(next['task']).toBeNull();
    expect(String(next['summary'])).toContain('Nothing is actionable: all 2 remaining task(s) are blocked.');
    expect(String(next['summary'])).toContain('would release 1 of them');
  });

  it('[WL-47] tracker_search finds every type literally and respects scope filters', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    await h.call('project_update', { id: projectId, description: 'card payments' });
    await h.call('epic_update', { id: epicId, description: 'Card vault' });
    await task(h, epicId, 'Tokenize card', { description: 'PCI scope' });
    await h.call('note_save', { title: 'card decision', content: 'vault provider' });
    const all = await h.obj('tracker_search', { query: 'CARD' });
    expect(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, (v as unknown[]).length]))).toEqual({ projects: 1, epics: 1, tasks: 1, notes: 1 });
    expect((all['tasks'] as Record<string, unknown>[])[0]).toMatchObject({ title: 'Tokenize card', excerpt: 'PCI scope', status: 'todo' });
    expect(await h.obj('tracker_search', { query: 'card vault', entity_types: ['epic', 'note'] })).toEqual({
      epics: [expect.objectContaining({ name: 'E' })],
      notes: [expect.objectContaining({ title: 'card decision' })],
    });
    expect((await h.obj('tracker_search', { query: 'c.rd', entity_types: ['task'] }))['tasks']).toEqual([]);
    expect((await h.obj('tracker_search', { query: 'card', entity_types: ['task'], branch: 'nope' }))['tasks']).toEqual([]);
    expect((await h.obj('tracker_search', { query: 'card', entity_types: ['project'], project_id: projectId }))['projects']).toHaveLength(1);
  });

  it('[WL-10] tracker_session_diff summarizes changes since a moment', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    h.clock.advance(60_000);
    const since = h.clock.now().toISOString();
    const t = await task(h, epicId, 'T');
    await h.call('task_update', { id: t['id'], status: 'in_progress', priority: 'high' });
    const diff = await h.obj('tracker_session_diff', { since });
    expect(diff).toMatchObject({
      since,
      until: since,
      total_changes: 3,
      summary: { created: 1, updated: 1, status_changed: 1, deleted: 0 },
      by_entity_type: { task: { created: 1, updated: 1, status_changed: 1, deleted: 0 } },
      highlights: ["Task 'T' created", "Task 'T' status: todo -> in_progress"],
    });
    expect((await h.obj('tracker_session_diff', { since: '2026-10-03' }))['total_changes']).toBe(5);
    expect(isWarlogError(await failure(h.call('tracker_session_diff', { since: 'yesterday' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-10] activity_log lists records newest first with filters', async () => {
    const h = trackerHarness({ mode });
    const a = await container(h);
    const b = await container(h);
    const t = await task(h, a.epicId, 'T');
    await h.call('task_update', { id: t['id'], status: 'done' });
    expect((await h.rows('activity_log', { limit: 2 })).map((r) => r['action'])).toEqual(['status_changed', 'created']);
    expect((await h.rows('activity_log', { entity_type: 'task' })).length).toBe(2);
    expect((await h.rows('activity_log', { entity_id: t['id'], action: 'status_changed' }))[0]).toMatchObject({ old_value: 'todo', new_value: 'done', machine: 'm-abc12345' });
    expect((await h.rows('activity_log', { project_id: b.projectId })).length).toBe(2);
    expect(await h.rows('activity_log', { since: '2026-10-03T12:00:00.000Z' })).toEqual([]);
    expect((await h.rows('activity_log', { since: '2026-10-02' })).length).toBe(6);
  });
});

describe('tracker dashboard warnings', () => {
  it('[WL-43] tracker_dashboard reports files excluded from the view', async () => {
    const h = trackerHarness();
    const { projectId } = await container(h);
    const dir = join(String(h.roots.repository?.root), 'projects', projectId, 'tasks');
    h.fs.files.set(join(dir, '01J00000000000000000000077 (conflicted copy).md'), 'x');
    h.fs.files.set(join(dir, '01J00000000000000000000078.md'), 'not front matter');
    const d = await h.obj('tracker_dashboard', { project_id: projectId });
    expect(d['store_warnings']).toEqual({ conflict_copies: 1, invalid_files: 1, hint: 'run doctor to list the excluded files' });
  });
});
