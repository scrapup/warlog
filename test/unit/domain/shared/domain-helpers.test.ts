import { describe, expect, it } from '@jest/globals';
import type { IndexedEntity } from '../../../../src/core/ports/store-view.port.ts';
import { percent, priorityRank, sortOrder, statusRank, tagsOf } from '../../../../src/domain/shared/rows.ts';
import { findCycle } from '../../../../src/domain/task/dependency-engine.ts';
import { idsIn, subtasksOf } from '../../../../src/domain/task/task-graph.ts';
import { templateTasks } from '../../../../src/domain/template/template-rules.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';

/**
 * An entity with hand-edited fields.
 * @param data - Front matter.
 * @returns The entity.
 */
function edited(data: Record<string, unknown>): IndexedEntity {
  return { id: 'x', type: 'task', scope: 'repo', projectId: undefined, path: '/x', record: { data, body: '' }, deleted: false };
}

describe('rank of values read from files', () => {
  /**
   * An entity with the given data.
   * @param data - Front-matter data.
   * @returns The entity.
   */
  function entity(data: Record<string, unknown>): IndexedEntity {
    return { id: 'x', type: 'task', record: { data, body: '' } } as unknown as IndexedEntity;
  }

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 5, undefined])('[WL-10] a hand-edited priority or status of %p ranks last instead of becoming NaN', (value) => {
    expect(priorityRank(entity({ priority: value }))).toBe(4);
    expect(statusRank(entity({ status: value }))).toBe(5);
  });

  it('[WL-10] known values keep their rank', () => {
    expect([priorityRank(entity({ priority: 'critical' })), priorityRank(entity({ priority: 'low' })), statusRank(entity({ status: 'blocked' })), statusRank(entity({ status: 'done' }))]).toEqual([0, 3, 0, 4]);
  });
});

describe('domain helpers on hand-edited values', () => {
  it('ranks unknown priorities and statuses last and reads malformed fields as empty', () => {
    const odd = edited({ priority: 'urgent', status: 'parked', sort_order: '3', tags: 'a', depends_on: 'x', subtasks: 'none', tasks: {} });
    expect(priorityRank(odd)).toBe(4);
    expect(statusRank(odd)).toBe(5);
    expect(sortOrder(odd)).toBe(0);
    expect(tagsOf(odd)).toEqual([]);
    expect(idsIn(odd, 'depends_on')).toEqual([]);
    expect(subtasksOf(odd)).toEqual([]);
    expect(templateTasks(odd)).toEqual([]);
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(0, 0)).toBe(0);
  });

  it('[WL-13] a dependency on a task outside the graph ends the search there', () => {
    expect(findCycle(new Map(), 'a', ['z'])).toBeUndefined();
  });
});

describe('subtask completion guard', () => {
  it('[WL-10] finishing a subtask before the siblings it waits on needs force', async () => {
    const h = trackerHarness();
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    const created = await h.obj('subtask_create', { task_id: t['id'], titles: ['a', 'b'] });
    const [a, b] = (created['subtasks'] as { id: string }[]).map((s) => s.id);
    await h.call('subtask_update', { id: b, depends_on: [a] });
    const error = await failure(h.call('subtask_update', { id: b, status: 'done' }));
    expect(isWarlogError(error, 'VALIDATION') ? error.message : '').toContain('cannot be completed');
    expect(await h.obj('subtask_update', { id: b, status: 'todo' })).toMatchObject({ status: 'todo' });
  });
});

describe('minimal imports', () => {
  it('[WL-14] fills every default of a minimal export', async () => {
    const h = trackerHarness();
    const result = await h.obj('tracker_import', {
      data: {
        format_version: '1.0',
        project: { name: 'min', epics: [{ name: 'E', tasks: [{ title: 'T', subtasks: [{ title: 's' }], comments: [{ content: 'c', is_deleted: true }] }] }], stories: [{ _original_id: 's1', title: 'S', _original_epic_id: 'nope' }] },
        notes: [{ title: 'n', content: 'x', related_entity_type: 'epic', _original_related_entity_id: 'missing' }, { title: 'p', content: 'y', related_entity_type: 'project', _original_related_entity_id: 1 }],
      },
    });
    const projectId = result['project_id'];
    expect(await h.obj('tracker_dashboard', { project_id: projectId })).toMatchObject({ project: { status: 'active' }, epics: [{ status: 'planned', priority: 'medium', sort_order: 0 }] });
    const [t] = await h.rows('task_list', { project_id: projectId });
    expect(t).toMatchObject({ status: 'todo', priority: 'medium', description_locked: false, subtask_count: 1 });
    expect((await h.rows('comment_list', { task_id: t?.['id'], include_deleted: true }))[0]).toMatchObject({ deleted_by: 'import', delete_reason: 'removed in the export' });
    expect((await h.rows('story_list', { project_id: projectId }))[0]).not.toHaveProperty('epic_id');
    const notes = await h.rows('note_list', { project_id: projectId });
    expect(notes.find((n) => n['title'] === 'n')).not.toHaveProperty('related_entity_type');
    expect(notes.find((n) => n['title'] === 'p')).toMatchObject({ related_entity_type: 'project', related_entity_id: projectId });
  });
});

describe('next ranking', () => {
  it('[WL-13] orders started work, then review, then the rest', async () => {
    const { rankCandidates } = await import('../../../../src/domain/tracker/next-ranking.ts');
    const t = (id: string, status: string): { task: IndexedEntity; epic: undefined } => ({ task: { ...edited({ status, priority: 'medium' }), id }, epic: undefined });
    expect(rankCandidates([t('a', 'todo'), t('b', 'review'), t('c', 'in_progress'), t('d', 'todo')], '2026-10-03').map((c) => c.task.id)).toEqual(['c', 'b', 'a', 'd']);
  });
});
