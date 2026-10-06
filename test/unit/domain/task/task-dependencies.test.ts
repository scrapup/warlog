import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { cleanDependencies, decideStatus, findCycle, unmetDependencies } from '../../../../src/domain/task/dependency-engine.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, statusOf, task } from '../../../support/tracker-setup.ts';

const MISSING = '01J00000000000000000000099';

describe('dependency engine', () => {
  it('[WL-13] finds the cycle a new dependency list would create', () => {
    const edges = new Map([
      ['b', ['c']],
      ['c', ['a']],
    ]);
    expect(findCycle(edges, 'a', ['b'])).toEqual(['a', 'b', 'c', 'a']);
    expect(findCycle(edges, 'a', [])).toBeUndefined();
    expect(findCycle(new Map([['b', ['c']], ['c', []]]), 'a', ['b', 'c'])).toBeUndefined();
    expect(findCycle(new Map([['b', ['b']]]), 'a', ['b'])).toEqual(['b', 'b']);
  });

  it('[WL-13] decides automatic block and unblock', () => {
    expect(decideStatus('todo', 1, 1, false)).toEqual({ status: 'blocked', transition: 'auto_blocked' });
    expect(decideStatus('blocked', 1, 0, false)).toEqual({ status: 'todo', transition: 'auto_unblocked' });
    expect(decideStatus('blocked', 0, 0, false)).toEqual({ status: 'blocked' });
    expect(decideStatus('blocked', 0, 0, true)).toEqual({ status: 'todo', transition: 'auto_unblocked' });
    expect(decideStatus('done', 1, 1, false)).toEqual({ status: 'done' });
    expect(decideStatus('in_progress', 1, 0, false)).toEqual({ status: 'in_progress' });
  });

  it('[WL-44] a missing dependency counts as unmet; lists are cleaned', () => {
    expect(unmetDependencies(['a', 'b', 'c'], (id) => ({ a: 'done', b: 'todo' })[id])).toEqual(['b', 'c']);
    expect(cleanDependencies('x', ['a', 'x', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

describe.each(['lazy', 'live'] as const)('task dependencies (%s index)', (mode) => {
  it('[WL-13] a task with unfinished dependencies is blocked and unblocked automatically when they finish', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = await task(h, epicId, 'A');
    const b = await task(h, epicId, 'B');
    const c = await task(h, epicId, 'C', { depends_on: [a['id'], b['id']] });
    expect(c).toMatchObject({ status: 'blocked', blocked_by_deps: [a['id'], b['id']] });
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'status_changed', summary: `Task 'C' auto-blocked: depends on ${String(a['id'])}, ${String(b['id'])}` });
    await h.call('task_update', { id: a['id'], status: 'done' });
    expect(await h.obj('task_get', { id: c['id'] })).toMatchObject({ status: 'blocked', blocked_by_deps: [b['id']] });
    await h.call('task_update', { id: b['id'], status: 'done' });
    const released = await h.obj('task_get', { id: c['id'] });
    expect(released['status']).toBe('todo');
    expect(released).not.toHaveProperty('blocked_by_deps');
    expect(h.activityRecords().at(-1)).toMatchObject({ summary: "Task 'C' auto-unblocked: all dependencies met", old_value: 'blocked', new_value: 'todo' });
  });

  it('[WL-13] reopening a finished dependency blocks its dependents again', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = await task(h, epicId, 'A', { status: 'done' });
    const b = await task(h, epicId, 'B', { depends_on: [a['id']] });
    expect(b['status']).toBe('todo');
    await h.call('task_update', { id: a['id'], status: 'in_progress' });
    expect(await statusOf(h, b['id'])).toBe('blocked');
  });

  it('[WL-13] replacing dependencies re-evaluates the task and refuses cycles', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = await task(h, epicId, 'A');
    const b = await task(h, epicId, 'B', { depends_on: [a['id']] });
    const error = await failure(h.call('task_update', { id: a['id'], depends_on: [b['id']] }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
    expect(isWarlogError(error, 'VALIDATION') ? error.details?.['cycle'] : undefined).toEqual([a['id'], b['id'], a['id']]);
    expect(await h.obj('task_update', { id: b['id'], depends_on: [] })).toMatchObject({ status: 'todo', depends_on: [] });
    expect(await h.obj('task_update', { id: b['id'], depends_on: [a['id'], b['id']] })).toMatchObject({ status: 'blocked', depends_on: [a['id']] });
  });

  it('[WL-44] a dependency on a task not present yet is kept as pending and keeps the task blocked', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'Waits', { depends_on: [MISSING] });
    expect(t).toMatchObject({ status: 'blocked', depends_on: [MISSING], blocked_by_deps: [MISSING] });
    expect((await h.view()).pendingLinks()).toEqual([{ from: t['id'], rel: 'depends_on', target: MISSING }]);
    expect((await h.obj('task_get', { id: t['id'] }))['depends_on']).toEqual([{ id: MISSING, status: 'missing' }]);
  });

  it('[WL-13] task_get lists dependencies and dependents as briefs', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = await task(h, epicId, 'A');
    const b = await task(h, epicId, 'B', { depends_on: [a['id']] });
    expect((await h.obj('task_get', { id: a['id'] }))['dependents']).toEqual([{ id: b['id'], title: 'B', status: 'blocked' }]);
    expect((await h.obj('task_get', { id: b['id'] }))['depends_on']).toEqual([{ id: a['id'], title: 'A', status: 'todo' }]);
  });
});
