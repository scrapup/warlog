import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

/**
 * Creates a task with subtasks.
 * @param h - Harness.
 * @param titles - Subtask titles.
 * @returns Task id and subtask ids.
 */
async function withSubtasks(h: TrackerHarness, titles: string[]): Promise<{ taskId: string; ids: string[] }> {
  const { epicId } = await container(h);
  const t = await task(h, epicId, 'T');
  const created = await h.obj('subtask_create', { task_id: t['id'], titles });
  return { taskId: String(t['id']), ids: (created['subtasks'] as { id: string }[]).map((s) => s.id) };
}

/**
 * Subtasks of a task as returned by task_get.
 * @param h - Harness.
 * @param taskId - Task.
 * @returns Rows.
 */
async function subtasks(h: TrackerHarness, taskId: string): Promise<Record<string, unknown>[]> {
  return (await h.obj('task_get', { id: taskId }))['subtasks'] as Record<string, unknown>[];
}

describe.each(['lazy', 'live'] as const)('subtask operations (%s index)', (mode) => {
  it('[WL-10] subtask_create appends checklist items in the task file and bumps its rev', async () => {
    const h = trackerHarness({ mode });
    const { taskId, ids } = await withSubtasks(h, ['one', 'two']);
    const more = await h.obj('subtask_create', { task_id: taskId, titles: ['three'], depends_on: [ids[0]] });
    expect(more['subtasks']).toEqual([expect.objectContaining({ title: 'three', status: 'todo', sort_order: 3, depends_on: [ids[0]] })]);
    const got = await h.obj('task_get', { id: taskId });
    expect(got['rev']).toBe(3);
    expect((got['subtasks'] as Record<string, unknown>[]).map((s) => s['title'])).toEqual(['one', 'two', 'three']);
    expect((got['subtasks'] as Record<string, unknown>[])[2]).toMatchObject({ depends_on: [{ id: ids[0], title: 'one', status: 'todo' }], blocked: true });
    expect(h.activityRecords().filter((r) => r['entity_type'] === 'subtask').map((r) => r['summary'])).toEqual(["Subtask 'one' created", "Subtask 'two' created", "Subtask 'three' created"]);
    expect(isWarlogError(await failure(h.call('subtask_create', { task_id: taskId, titles: ['x'], depends_on: ['01J00000000000000000000099'] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('subtask_create', { task_id: taskId, titles: 'not an array' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-10] subtask_update needs force to start before awaited siblings finish', async () => {
    const h = trackerHarness({ mode });
    const { ids } = await withSubtasks(h, ['one', 'two']);
    await h.call('subtask_update', { id: ids[1], depends_on: [ids[0]] });
    expect(isWarlogError(await failure(h.call('subtask_update', { id: ids[1], status: 'in_progress' })), 'VALIDATION')).toBe(true);
    const forced = await h.obj('subtask_update', { id: ids[1], status: 'done', force: true });
    expect(forced).toMatchObject({ status: 'done', depends_on: [{ id: ids[0], status: 'todo' }], blocked: true });
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'status_changed', forced: true, entity_type: 'subtask', entity_id: ids[1] });
    expect(await h.obj('subtask_update', { id: ids[0], status: 'done', title: 'first' })).toMatchObject({ title: 'first', status: 'done' });
    expect(isWarlogError(await failure(h.call('subtask_update', { id: ids[0] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('subtask_update', { id: '01J00000000000000000000099', title: 'x' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-10] subtask_update blocks replaces the siblings waiting on a subtask and refuses cycles', async () => {
    const h = trackerHarness({ mode });
    const { taskId, ids } = await withSubtasks(h, ['a', 'b', 'c']);
    await h.call('subtask_update', { id: ids[0], blocks: [ids[1], ids[2]] });
    expect((await subtasks(h, taskId)).map((s) => (s['depends_on'] as { id: string }[] | undefined)?.map((d) => d.id) ?? [])).toEqual([[], [ids[0]], [ids[0]]]);
    await h.call('subtask_update', { id: ids[0], blocks: [ids[2]] });
    expect((await subtasks(h, taskId))[1]).not.toHaveProperty('depends_on');
    expect(isWarlogError(await failure(h.call('subtask_update', { id: ids[0], depends_on: [ids[2]] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('subtask_update', { id: ids[0], blocks: ['01J00000000000000000000099'] })), 'VALIDATION')).toBe(true);
    expect(await h.obj('subtask_update', { id: ids[2], sort_order: 9 })).toMatchObject({ sort_order: 9 });
  });

  it('[WL-10] subtask_reorder and subtask_delete keep positions and sibling links consistent', async () => {
    const h = trackerHarness({ mode });
    const { taskId, ids } = await withSubtasks(h, ['a', 'b', 'c']);
    const rows = await h.rows('subtask_reorder', { task_id: taskId, ordered_ids: [ids[2]] });
    expect(rows.map((r) => [r['title'], r['sort_order']])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
    await h.call('subtask_update', { id: ids[1], depends_on: [ids[0]] });
    expect(await h.obj('subtask_delete', { ids: [ids[0]] })).toEqual({ deleted: [{ id: ids[0], title: 'a', deleted: true }] });
    const left = await subtasks(h, taskId);
    expect(left.map((s) => [s['title'], s['sort_order']])).toEqual([
      ['c', 1],
      ['b', 2],
    ]);
    expect(left[1]).not.toHaveProperty('blocked');
    expect(isWarlogError(await failure(h.call('subtask_delete', { ids: ['01J00000000000000000000099'] })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('subtask_reorder', { task_id: taskId, ordered_ids: ['01J00000000000000000000099'] })), 'VALIDATION')).toBe(true);
  });

  it('[WL-10] subtask_reorder on a task without subtasks is a validation error', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    expect(isWarlogError(await failure(h.call('subtask_reorder', { task_id: t['id'], ordered_ids: [] })), 'VALIDATION')).toBe(true);
  });
});

describe('subtask concurrency', () => {
  it('[WL-42] concurrent subtask edits on one task end in CONFLICT instead of a lost update', async () => {
    const h = trackerHarness();
    const { ids } = await withSubtasks(h, ['a', 'b']);
    const results = await Promise.allSettled([h.call('subtask_update', { id: ids[0], title: 'A' }), h.call('subtask_update', { id: ids[1], title: 'B' })]);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(isWarlogError(rejected[0]?.status === 'rejected' ? rejected[0].reason : undefined, 'CONFLICT')).toBe(true);
  });
});
