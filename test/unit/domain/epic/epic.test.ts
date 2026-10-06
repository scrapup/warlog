import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';

/**
 * Captures the error of a promise.
 * @param promise - Promise expected to fail.
 * @returns The error.
 */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a failure');
    },
    (error: unknown) => error,
  );
}

/**
 * Creates a project.
 * @param h - Harness.
 * @returns Its id.
 */
async function project(h: TrackerHarness): Promise<string> {
  return String((await h.obj('project_create', { name: 'p' }))['id']);
}

describe.each(['lazy', 'live'] as const)('epic operations (%s index)', (mode) => {
  it('[WL-10] epic_create applies saga defaults and resolves branch "current"', async () => {
    const h = trackerHarness({ mode });
    const projectId = await project(h);
    h.branch = 'feat/x';
    const epic = await h.obj('epic_create', { project_id: projectId, name: 'E', branch: 'current', description: 'Why' });
    expect(epic).toMatchObject({ project_id: projectId, name: 'E', status: 'planned', priority: 'medium', branch: 'feat/x', sort_order: 0, archived: false, description: 'Why' });
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'created', entity_type: 'epic', project_id: projectId, summary: `Epic 'E' created in project ${projectId} on branch 'feat/x'` });
  });

  it('[WL-10] epic_create without branch stores none; "current" outside a branch stores none', async () => {
    const h = trackerHarness({ mode });
    const projectId = await project(h);
    h.branch = undefined;
    expect(await h.obj('epic_create', { project_id: projectId, name: 'A', branch: 'current' })).not.toHaveProperty('branch');
    expect(await h.obj('epic_create', { project_id: projectId, name: 'B' })).not.toHaveProperty('branch');
  });

  it('[WL-10] epic_create in an unknown project is NOT_FOUND', async () => {
    const h = trackerHarness({ mode });
    expect(isWarlogError(await failure(h.call('epic_create', { project_id: '01J00000000000000000000099', name: 'E' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-10] epic_list filters by status, priority, branch and archive, in manual order', async () => {
    const h = trackerHarness({ mode });
    const projectId = await project(h);
    const a = await h.obj('epic_create', { project_id: projectId, name: 'A', priority: 'high', branch: 'main' });
    const b = await h.obj('epic_create', { project_id: projectId, name: 'B', status: 'in_progress' });
    const c = await h.obj('epic_create', { project_id: projectId, name: 'C' });
    await h.call('epic_update', { id: c['id'], sort_order: 1 });
    await h.call('epic_update', { id: a['id'], sort_order: 2 });
    await h.call('epic_archive', { id: b['id'] });
    const names = async (input: Record<string, unknown>): Promise<unknown[]> => (await h.rows('epic_list', { project_id: projectId, ...input })).map((r) => r['name']);
    expect(await names({})).toEqual(['C', 'A']);
    expect(await names({ include_archived: true })).toEqual(['B', 'C', 'A']);
    expect(await names({ priority: 'high' })).toEqual(['A']);
    expect(await names({ status: 'in_progress', include_archived: true })).toEqual(['B']);
    expect(await names({ branch: 'current' })).toEqual(['A']);
    expect(await names({ branch: '' })).toEqual(['C']);
    expect((await h.rows('epic_list', { project_id: projectId }))[0]).toMatchObject({ task_count: 0, done_count: 0, blocked_count: 0, completion_pct: 0 });
  });

  it('[WL-10] epic_list of an unknown project is NOT_FOUND', async () => {
    const h = trackerHarness({ mode });
    expect(isWarlogError(await failure(h.call('epic_list', { project_id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-10] epic_update changes fields, clears the branch with "" and records tracked changes', async () => {
    const h = trackerHarness({ mode });
    const projectId = await project(h);
    const epic = await h.obj('epic_create', { project_id: projectId, name: 'E', branch: 'main' });
    const updated = await h.obj('epic_update', { id: epic['id'], name: 'E2', status: 'in_progress', branch: '' });
    expect(updated).toMatchObject({ name: 'E2', status: 'in_progress', branch: null, rev: 2 });
    expect(h.activityRecords().slice(2).map((r) => [r['action'], r['field']])).toEqual([
      ['updated', 'name'],
      ['status_changed', 'status'],
      ['updated', 'branch'],
    ]);
    expect(isWarlogError(await failure(h.call('epic_update', { id: epic['id'] })), 'VALIDATION')).toBe(true);
  });

  it('[WL-10] epic_archive archives, reports an unchanged state, and unarchives', async () => {
    const h = trackerHarness({ mode });
    const projectId = await project(h);
    const epic = await h.obj('epic_create', { project_id: projectId, name: 'E' });
    const archived = await h.obj('epic_archive', { id: epic['id'] });
    expect(archived['message']).toBe(`Epic ${String(epic['id'])} archived. It and its 0 task(s) are hidden from listings; pass include_archived to see them.`);
    expect(archived['epic']).toMatchObject({ archived: true, archived_at: '2026-10-03T12:00:00.000Z' });
    expect((await h.obj('epic_archive', { id: epic['id'] }))['message']).toBe(`Epic ${String(epic['id'])} is already archived.`);
    const back = await h.obj('epic_archive', { id: epic['id'], archived: false });
    expect(back['message']).toBe(`Epic ${String(epic['id'])} is active again.`);
    expect(back['epic']).not.toHaveProperty('archived_at');
    expect((await h.obj('epic_archive', { id: epic['id'], archived: false }))['message']).toBe(`Epic ${String(epic['id'])} is already active.`);
  });
});
