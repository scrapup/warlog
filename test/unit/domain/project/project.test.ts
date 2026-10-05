import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';

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

describe.each(['lazy', 'live'] as const)('project operations (%s index)', (mode) => {
  it('[WL-10] project_create stores a project file with saga defaults and records activity', async () => {
    const h = trackerHarness({ mode });
    const project = await h.obj('project_create', { name: 'parity', description: 'Body', tags: ['q4'] });
    expect(project).toMatchObject({ name: 'parity', status: 'active', tags: ['q4'], description: 'Body', rev: 1 });
    expect(typeof project['id']).toBe('string');
    expect(h.fs.files.get(`${h.roots.repository?.root}/projects/${String(project['id'])}/project.md`)).toContain('name: parity');
    expect(h.activityRecords()).toEqual([expect.objectContaining({ action: 'created', entity_type: 'project', entity_id: project['id'], summary: "Project 'parity' created" })]);
  });

  it('[WL-11] project ids are opaque ULID strings and integers are rejected', async () => {
    const h = trackerHarness({ mode });
    const error = await failure(h.call('project_update', { id: 7, name: 'x' }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
  });

  it('[WL-10] project_list returns counts, newest first, filtered by status', async () => {
    const h = trackerHarness({ mode });
    const a = await h.obj('project_create', { name: 'a' });
    const b = await h.obj('project_create', { name: 'b', status: 'on_hold' });
    const epic = await h.obj('epic_create', { project_id: a['id'], name: 'E' });
    await h.call('task_create', { epic_id: epic['id'], title: 'T1' }).catch(() => undefined);
    const rows = await h.rows('project_list');
    expect(rows.map((r) => r['name'])).toEqual(['b', 'a']);
    expect(rows[1]).toMatchObject({ epic_count: 1, completion_pct: 0 });
    expect((await h.rows('project_list', { status: 'on_hold' })).map((r) => r['id'])).toEqual([b['id']]);
  });

  it('[WL-10] project_update changes fields, records status_changed and archives softly', async () => {
    const h = trackerHarness({ mode });
    const p = await h.obj('project_create', { name: 'a' });
    const updated = await h.obj('project_update', { id: p['id'], status: 'archived', description: 'New body' });
    expect(updated).toMatchObject({ status: 'archived', description: 'New body', rev: 2 });
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'status_changed', field: 'status', old_value: 'active', new_value: 'archived' });
    expect((await h.rows('project_list', { status: 'archived' })).length).toBe(1);
  });

  it('[WL-10] project_update without fields is a validation error and an unknown id is NOT_FOUND', async () => {
    const h = trackerHarness({ mode });
    const p = await h.obj('project_create', { name: 'a' });
    expect(isWarlogError(await failure(h.call('project_update', { id: p['id'] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('project_update', { id: '01J00000000000000000000099', name: 'x' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-10] project writes need a repository context', async () => {
    const h = trackerHarness({ mode, withRepository: false });
    expect(isWarlogError(await failure(h.call('project_create', { name: 'a' })), 'NO_REPO_CONTEXT')).toBe(true);
  });
});

describe('tracker_init', () => {
  it('[WL-10] asks for a name on an empty store, creates the first project, then returns it', async () => {
    const h = trackerHarness();
    expect(await h.obj('tracker_init')).toEqual({ message: 'Store is empty. Provide a project_name to create your first project.', projects: [] });
    const created = await h.obj('tracker_init', { project_name: 'first', project_description: 'Desc' });
    expect(created['message']).toBe("Project 'first' created. Use epic_create to start adding work.");
    expect(created['project']).toMatchObject({ name: 'first', status: 'active', description: 'Desc' });
    const again = await h.obj('tracker_init', { project_name: 'second' });
    expect(again).toMatchObject({ message: 'Tracker already initialized. Returning existing project.', project: { name: 'first' } });
    expect(h.activityRecords().map((r) => r['summary'])).toEqual(["Project 'first' initialized"]);
  });
});
