import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { Presenter } from '../../../../src/core/presenter/presenter.ts';
import { norm } from '../../../support/fakes/path-map.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure } from '../../../support/tracker-setup.ts';

/**
 * Path of a variable file in the fixture store.
 * @param h - Harness.
 * @param scope - Scope.
 * @param name - Variable name.
 * @param projectId - Project, for project scope.
 * @returns The path.
 */
function varPath(h: TrackerHarness, scope: 'global' | 'repo' | 'project', name: string, projectId = ''): string {
  const repo = String(h.roots.repository?.root);
  const dir = scope === 'global' ? join(h.roots.global, 'global', 'vars') : scope === 'repo' ? join(repo, 'vars') : join(repo, 'projects', projectId, 'vars');
  return join(dir, `${name}.yaml`);
}

describe.each(['lazy', 'live'] as const)('variable operations (%s index)', (mode) => {
  it('[WL-25] the most specific scope wins and its origin is returned; no deep merge', async () => {
    const h = trackerHarness({ mode });
    const { projectId } = await container(h);
    await h.call('var_set', { name: 'forge.parallel_executors', value: true, scope: 'global' });
    await h.call('var_set', { name: 'cfg', value: { a: 1, b: 2 }, scope: 'global' });
    expect(await h.obj('var_get', { name: 'forge.parallel_executors' })).toEqual({ value: true, type: 'boolean', scope: 'global' });
    await h.call('var_set', { name: 'forge.parallel_executors', value: false, scope: 'repo' });
    await h.call('var_set', { name: 'cfg', value: { a: 9 }, scope: 'repo' });
    expect(await h.obj('var_get', { name: 'forge.parallel_executors' })).toEqual({ value: false, type: 'boolean', scope: 'repo' });
    expect(await h.obj('var_get', { name: 'cfg' })).toEqual({ value: { a: 9 }, type: 'object', scope: 'repo' });
    await h.call('var_set', { name: 'forge.parallel_executors', value: true, scope: 'project', project_id: projectId });
    expect(await h.obj('var_get', { name: 'forge.parallel_executors', project_id: projectId })).toEqual({ value: true, type: 'boolean', scope: 'project', project_id: projectId });
    expect((await h.obj('var_get', { name: 'forge.parallel_executors' }))['scope']).toBe('repo');
    h.defaultProject = projectId;
    expect((await h.obj('var_get', { name: 'forge.parallel_executors' }))['scope']).toBe('project');
    h.defaultProject = 'a-project-name';
    expect((await h.obj('var_get', { name: 'forge.parallel_executors' }))['scope']).toBe('repo');
    h.defaultProject = undefined;
    expect(await h.obj('var_get', { name: 'forge.parallel_executors', scope: 'global' })).toMatchObject({ value: true, scope: 'global' });
    expect(isWarlogError(await failure(h.call('var_get', { name: 'forge.parallel_executors', scope: 'project', project_id: projectId, path: 'x' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-27] dots are namespaces and path reads a field inside the value', async () => {
    const h = trackerHarness({ mode });
    await h.call('var_set', { name: 'limits.build', value: { max: 5, list: [{ n: 'a' }] }, scope: 'global' });
    expect(await h.obj('var_get', { name: 'limits.build', path: 'max' })).toEqual({ value: 5, type: 'integer', scope: 'global', path: 'max' });
    expect(await h.obj('var_get', { name: 'limits.build', path: 'list.0.n' })).toMatchObject({ value: 'a', type: 'string' });
    expect(await h.obj('var_get', { name: 'limits.build', path: 'list' })).toMatchObject({ value: [{ n: 'a' }], type: 'array' });
    expect(isWarlogError(await failure(h.call('var_get', { name: 'limits.build', path: 'nope' })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_get', { name: 'limits..build' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_get', { name: '../escape' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_get', { name: 'Upper' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-28] values keep the type they were written with: no, off, 012 and 1.10 are never coerced', async () => {
    const h = trackerHarness({ mode });
    const values: [string, unknown, string][] = [
      ['v.no', 'no', 'string'],
      ['v.off', 'off', 'string'],
      ['v.octal', '012', 'string'],
      ['v.version', '1.10', 'string'],
      ['v.null', 'null', 'string'],
      ['v.flag', false, 'boolean'],
      ['v.count', 12, 'integer'],
      ['v.ratio', 1.5, 'number'],
      ['v.list', ['no', 12, false], 'array'],
    ];
    for (const [name, value] of values) {
      await h.call('var_set', { name, value, scope: 'global' });
    }
    for (const [name, value, type] of values) {
      expect(await h.obj('var_get', { name })).toMatchObject({ value, type });
    }
    expect([...h.fs.files.values()].some((text) => text.includes('value: "012"') && !text.includes('value: 012'))).toBe(true);
    expect(isWarlogError(await failure(h.call('var_set', { name: 'v.flag', value: 'false', scope: 'global' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-26] a value must match its type and schema; changing the type needs force', async () => {
    const h = trackerHarness({ mode });
    await h.call('var_set', { name: 'retries', value: 2, scope: 'repo', schema: { type: 'integer', minimum: 0, maximum: 5 } });
    expect(isWarlogError(await failure(h.call('var_set', { name: 'retries', value: 9, scope: 'repo' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_set', { name: 'retries', value: 'x', scope: 'repo' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_set', { name: 'retries', value: 1.5, scope: 'repo', type: 'integer' })), 'VALIDATION')).toBe(true);
    const typeChange = await failure(h.call('var_set', { name: 'retries', value: 'many', scope: 'repo', type: 'string' }));
    expect(isWarlogError(typeChange, 'VALIDATION') ? typeChange.message : '').toContain('needs force');
    expect(await h.obj('var_set', { name: 'retries', value: 'many', scope: 'repo', type: 'string', force: true })).toMatchObject({ type: 'string', rev: 2 });
    expect(await h.obj('var_set', { name: 'retries', value: 'few', scope: 'repo' })).toMatchObject({ type: 'string', rev: 3 });
    expect(await h.obj('var_set', { name: 'retries', value: 3, scope: 'repo', type: 'integer', force: true })).toMatchObject({ type: 'integer' });
    expect(await h.obj('var_set', { name: 'retries', value: 4, scope: 'repo' })).toMatchObject({ rev: 5 });
    expect(isWarlogError(await failure(h.call('var_set', { name: 'x', value: 1, scope: 'repo', schema: { pattern: '^a' } })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_set', { name: 'x', value: 'ab', scope: 'repo', schema: { type: 'string', maxLength: 1 } })), 'VALIDATION')).toBe(true);
    expect(await h.obj('var_set', { name: 'n', value: 2, scope: 'repo', type: 'number' })).toMatchObject({ type: 'number' });
    expect(await h.obj('var_set', { name: 'n', value: 3, scope: 'repo' })).toMatchObject({ type: 'number' });
  });

  it('[WL-09] secret-like values are rejected before anything is written', async () => {
    const h = trackerHarness({ mode });
    const before = new Map(h.fs.files);
    const error = await failure(h.call('var_set', { name: 'token', value: `ghp_${'a'.repeat(36)}`, scope: 'global' }));
    expect(isWarlogError(error, 'SECRET_REJECTED')).toBe(true);
    expect(JSON.stringify(isWarlogError(error, 'SECRET_REJECTED') ? error.details : '')).not.toContain('ghp_');
    expect(isWarlogError(await failure(h.call('var_set', { name: 'cfg', value: { nested: [`npm_${'b'.repeat(36)}`] }, scope: 'global' })), 'SECRET_REJECTED')).toBe(true);
    expect(new Map(h.fs.files)).toEqual(before);
  });

  it('[WL-25] var_list shows every variable or the effective set with its origin', async () => {
    const h = trackerHarness({ mode });
    const { projectId } = await container(h);
    const other = (await container(h)).projectId;
    await h.call('var_set', { name: 'a', value: 1, scope: 'global' });
    await h.call('var_set', { name: 'a', value: 2, scope: 'repo' });
    await h.call('var_set', { name: 'b', value: 'g', scope: 'global' });
    await h.call('var_set', { name: 'a', value: 3, scope: 'project', project_id: projectId });
    await h.call('var_set', { name: 'a', value: 4, scope: 'project', project_id: other });
    await h.call('var_set', { name: 'c', value: true, scope: 'repo' });
    const all = await h.rows('var_list');
    expect(all.map((r) => [r['name'], r['scope'], r['value']])).toEqual([
      ['a', 'project', 3],
      ['a', 'project', 4],
      ['a', 'repo', 2],
      ['a', 'global', 1],
      ['b', 'global', 'g'],
      ['c', 'repo', true],
    ]);
    expect((await h.rows('var_list', { scope: 'repo' })).map((r) => r['name'])).toEqual(['a', 'c']);
    expect((await h.rows('var_list', { scope: 'project', project_id: other })).map((r) => r['value'])).toEqual([4]);
    expect((await h.rows('var_list', { effective: true })).map((r) => [r['name'], r['scope'], r['value']])).toEqual([
      ['a', 'repo', 2],
      ['b', 'global', 'g'],
      ['c', 'repo', true],
    ]);
    expect((await h.rows('var_list', { effective: true, project_id: projectId })).map((r) => [r['name'], r['scope'], r['value']])).toEqual([
      ['a', 'project', 3],
      ['b', 'global', 'g'],
      ['c', 'repo', true],
    ]);
    expect(isWarlogError(await failure(h.call('var_list', { effective: true, scope: 'repo' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-08] var_delete is soft: reads fall through to the next scope and the name can be set again', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await h.call('var_set', { name: 'x', value: 'global', scope: 'global' });
    await h.call('var_set', { name: 'x', value: 5, scope: 'repo' });
    expect(await h.obj('var_delete', { name: 'x', scope: 'repo' })).toEqual({ name: 'x', scope: 'repo', deleted: true });
    expect(h.fs.files.get(varPath(h, 'repo', 'x'))).toContain('deleted_at');
    expect(await h.obj('var_get', { name: 'x' })).toMatchObject({ value: 'global', scope: 'global' });
    expect((await h.rows('var_list')).map((r) => r['scope'])).toEqual(['global']);
    expect(isWarlogError(await failure(h.call('var_delete', { name: 'x', scope: 'repo' })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_delete', { name: 'nope', scope: 'global' })), 'NOT_FOUND')).toBe(true);
    expect(await h.obj('var_set', { name: 'x', value: 'back', scope: 'repo', type: 'string' })).toMatchObject({ type: 'string', rev: 3 });
    expect(await h.obj('var_get', { name: 'x' })).toMatchObject({ value: 'back', scope: 'repo' });
    expect(isWarlogError(await failure(h.call('var_get', { name: 'absent' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-25] repository and project scopes need a repository; project scope needs a project', async () => {
    const h = trackerHarness({ mode, withRepository: false });
    expect(isWarlogError(await failure(h.call('var_set', { name: 'x', value: 1, scope: 'repo' })), 'NO_REPO_CONTEXT')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_get', { name: 'x', scope: 'repo' })), 'NO_REPO_CONTEXT')).toBe(true);
    await h.call('var_set', { name: 'x', value: 1, scope: 'global' });
    expect(await h.obj('var_get', { name: 'x' })).toMatchObject({ scope: 'global' });
    const g = trackerHarness({ mode });
    expect(isWarlogError(await failure(g.call('var_set', { name: 'x', value: 1, scope: 'project' })), 'VALIDATION')).toBe(true);
    expect(await g.obj('var_set', { name: 'x', value: 1, scope: 'project', project_id: '01J00000000000000000000099' })).toMatchObject({ scope: 'project', project_id: '01J00000000000000000000099' });
  });

  it('[WL-25] var writes record activity with names and scope, never values', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await h.call('var_set', { name: 'k', value: 'secret-ish-but-fine', scope: 'repo' });
    await h.call('var_set', { name: 'k', value: 'changed', scope: 'repo' });
    await h.call('var_set', { name: 'k', value: 'global', scope: 'global' });
    await h.call('var_delete', { name: 'k', scope: 'repo' });
    const records = h.activityRecords().filter((r) => r['entity_type'] === 'var');
    expect(records.map((r) => `${String(r['action'])} ${String(r['scope'])}`).sort()).toEqual(['created global', 'created repo', 'deleted repo', 'updated repo']);
    expect(JSON.stringify(records)).not.toContain('secret-ish');
    expect(records.find((r) => r['scope'] === 'global')).not.toHaveProperty('repo_key');
    expect(records.find((r) => r['action'] === 'deleted')).toHaveProperty('repo_key');
  });

  it('[WL-39] a scalar value prints raw by default; format or fields give the whole result', async () => {
    const h = trackerHarness({ mode });
    await h.call('var_set', { name: 'flag', value: false, scope: 'global' });
    await h.call('var_set', { name: 'obj', value: { a: 1 }, scope: 'global' });
    const presenter = new Presenter();
    const flag = await h.call('var_get', { name: 'flag' });
    expect(presenter.present(flag, 'yaml')).toBe('false');
    expect(presenter.present(flag, 'yaml', { format: 'yaml' })).toBe('value: false\ntype: boolean\nscope: global');
    expect(JSON.parse(presenter.present(flag, 'yaml', { format: 'json' }))).toEqual({ value: false, type: 'boolean', scope: 'global' });
    expect(presenter.present(flag, 'yaml', { fields: ['scope'] })).toBe('scope: global');
    expect(presenter.present(await h.call('var_get', { name: 'obj' }), 'yaml')).toBe('value:\n  a: 1\ntype: object\nscope: global');
    expect(norm(varPath(h, 'global', 'flag'))).toContain('/global/vars/flag.yaml');
  });
});

describe('hand-edited variable files', () => {
  it('[WL-26] a value that does not match its declared type, or a malformed file, is INVALID_FILE', async () => {
    const h = trackerHarness();
    await container(h);
    const file = (body: string): void => void h.fs.files.set(varPath(h, 'global', 'bad'), body);
    file('name: bad\ntype: boolean\nvalue: "no"\nrev: 1\nupdated_at: x\nmachine: m\n');
    expect(isWarlogError(await failure(h.call('var_get', { name: 'bad' })), 'INVALID_FILE')).toBe(true);
    file('name: other\ntype: string\nvalue: x\nrev: 1\n');
    expect(isWarlogError(await failure(h.call('var_get', { name: 'bad' })), 'INVALID_FILE')).toBe(true);
    file('name: bad\ntype: date\nvalue: x\nrev: 1\n');
    expect(isWarlogError(await failure(h.call('var_get', { name: 'bad' })), 'INVALID_FILE')).toBe(true);
    file('name: bad\ntype: string\nrev: 1\n');
    expect(isWarlogError(await failure(h.call('var_get', { name: 'bad' })), 'INVALID_FILE')).toBe(true);
    file('name: [unclosed\n');
    expect(isWarlogError(await failure(h.call('var_get', { name: 'bad' })), 'INVALID_FILE')).toBe(true);
    file('name: bad\n<<<<<<< HEAD\n=======\n>>>>>>> b\n');
    expect(isWarlogError(await failure(h.call('var_get', { name: 'bad' })), 'INVALID_FILE')).toBe(true);
    file(`name: bad\ntype: string\nvalue: ${'x'.repeat(3 * 1024 * 1024)}\nrev: 1\n`);
    expect(isWarlogError(await failure(h.call('var_get', { name: 'bad' })), 'INVALID_FILE')).toBe(true);
    expect(isWarlogError(await failure(h.call('var_set', { name: 'bad', value: 'x', scope: 'global' })), 'INVALID_FILE')).toBe(true);
  });

  it('[WL-25] a variable file written by hand is read, and a higher scope that is invalid is not skipped', async () => {
    const h = trackerHarness();
    await container(h);
    h.fs.files.set(varPath(h, 'global', 'hand'), 'name: hand\ntype: string\nvalue: no\nrev: 1\nupdated_at: x\nmachine: m\n');
    expect(await h.obj('var_get', { name: 'hand' })).toMatchObject({ value: 'no', type: 'string' });
    h.fs.files.set(varPath(h, 'repo', 'hand'), 'name: hand\ntype: integer\nvalue: 1.5\nrev: 1\n');
    expect(isWarlogError(await failure(h.call('var_get', { name: 'hand' })), 'INVALID_FILE')).toBe(true);
  });
});
