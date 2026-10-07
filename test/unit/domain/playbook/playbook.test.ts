import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import type { CommandObservation } from '../../../../src/core/ports/store-view.port.ts';
import { deriveStatuses, statusHere } from '../../../../src/domain/playbook/command-status-deriver.ts';
import { relativePath } from '../../../../src/domain/playbook/patterns-for.handler.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure } from '../../../support/tracker-setup.ts';

/**
 * An observation.
 * @param outcome - `ok` or `fail`.
 * @param minute - Minute of the observation.
 * @param os - Operating system.
 * @param node - Node major.
 * @returns The observation.
 */
function obs(outcome: string, minute: number, os = 'linux', node = '22'): CommandObservation {
  return { ts: `2026-10-03T12:${String(minute).padStart(2, '0')}:00.000Z`, machine: 'm', outcome, exitCode: outcome === 'ok' ? 0 : 1, env: { os, node } };
}

/**
 * Saves a memory.
 * @param h - Harness.
 * @param input - Fields.
 * @returns The stored memory.
 */
async function save(h: TrackerHarness, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return h.obj('memory_save', { content: '', ...input });
}

describe('command status derivation', () => {
  it('[WL-18] the latest observation decides per environment; a mix in the last five is flaky', () => {
    expect(deriveStatuses([obs('ok', 1), obs('ok', 2)])).toEqual([{ os: 'linux', node: '22', status: 'works', last_verified_at: '2026-10-03T12:02:00.000Z', last_exit_code: 0 }]);
    expect(deriveStatuses([obs('fail', 1), obs('fail', 2)])[0]).toMatchObject({ status: 'fails', last_exit_code: 1 });
    expect(deriveStatuses([obs('ok', 1), obs('fail', 2)])[0]?.status).toBe('flaky');
    expect(deriveStatuses([obs('fail', 1), ...[2, 3, 4, 5, 6].map((m) => obs('ok', m))])[0]?.status).toBe('works');
    expect(deriveStatuses([obs('fail', 1), ...[2, 3, 4, 5].map((m) => obs('ok', m))])[0]?.status).toBe('flaky');
    const mixed = deriveStatuses([obs('ok', 1, 'linux', '22'), obs('fail', 2, 'win32', '22'), obs('fail', 3, 'linux', '24')]);
    expect(mixed.map((s) => [s.os, s.node, s.status])).toEqual([
      ['linux', '22', 'works'],
      ['linux', '24', 'fails'],
      ['win32', '22', 'fails'],
    ]);
    expect(deriveStatuses([{ ...obs('ok', 1), exitCode: undefined, env: {} }])[0]).toEqual({ os: '', node: '', status: 'works', last_verified_at: '2026-10-03T12:01:00.000Z' });
    expect(deriveStatuses([])).toEqual([]);
  });

  it('[WL-18] the current environment wins; otherwise the best known elsewhere', () => {
    const statuses = deriveStatuses([obs('ok', 1, 'linux'), obs('fail', 2, 'win32')]);
    expect(statusHere(statuses, 'win32', '22')).toEqual({ status: 'fails', elsewhere: false });
    expect(statusHere(statuses, 'linux', '99')).toEqual({ status: 'works', elsewhere: false });
    expect(statusHere(statuses, 'darwin', '22')).toEqual({ status: 'works', elsewhere: true });
    expect(statusHere(deriveStatuses([obs('fail', 1, 'win32')]), 'darwin', '22')).toEqual({ status: 'fails', elsewhere: true });
    expect(statusHere([], 'linux', '22')).toBeUndefined();
  });
});

describe.each(['lazy', 'live'] as const)('command and issue recording (%s index)', (mode) => {
  it('[WL-18] command_record creates the command memory once and derives its status without rewriting it', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const first = await h.obj('command_record', { cmd: 'npm run test:unit', outcome: 'fail', exit_code: 1, error: 'Cannot find module jest', purpose: 'test' });
    expect(first).toMatchObject({ created: true, outcome: 'fail', environment: { os: 'linux', node: '22' }, status: 'fails' });
    const id = String(first['memory_id']);
    const file = [...h.fs.files].find(([p]) => p.endsWith(`${id}.md`));
    expect(file?.[1]).toContain('cmd: npm run test:unit');
    const second = await h.obj('command_record', { cmd: 'npm run test:unit', outcome: 'ok', exit_code: 0 });
    expect(second).toMatchObject({ created: false, memory_id: id, status: 'flaky' });
    expect([...h.fs.files].find(([p]) => p.endsWith(`${id}.md`))?.[1]).toBe(file?.[1]);
    const records = h.activityRecords().filter((r) => r['action'] === 'command_observed');
    expect(records).toEqual([
      expect.objectContaining({ cmd_memory_id: id, outcome: 'fail', exit_code: 1, error: 'Cannot find module jest', env: { os: 'linux', node: '22' } }),
      expect.objectContaining({ cmd_memory_id: id, outcome: 'ok', exit_code: 0 }),
    ]);
    expect(records[1]).not.toHaveProperty('error');
    await h.call('command_record', { cmd: 'npm run test:unit', outcome: 'ok' });
    expect((await h.obj('command_record', { cmd: 'npm run test:unit', outcome: 'ok' }))['status']).toBe('flaky');
    expect((await h.rows('memory_list', { kind: 'command' })).length).toBe(1);
  });

  it('[WL-18] an existing command memory is found by its exact command line, repository first', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const global = await save(h, { kind: 'command', title: 'g', cmd: 'make', scope: 'global' });
    expect(await h.obj('command_record', { cmd: 'make', outcome: 'ok' })).toMatchObject({ created: false, memory_id: global['id'] });
    const repo = await save(h, { kind: 'command', title: 'r', cmd: 'make', scope: 'repo' });
    expect(await h.obj('command_record', { cmd: 'make', outcome: 'ok' })).toMatchObject({ memory_id: repo['id'] });
    expect(await h.obj('command_record', { cmd: 'make', outcome: 'ok', scope: 'global' })).toMatchObject({ memory_id: global['id'] });
    expect(await h.obj('command_record', { cmd: 'make test', outcome: 'ok' })).toMatchObject({ created: true });
    await h.call('memory_archive', { id: repo['id'] });
    expect(await h.obj('command_record', { cmd: 'make', outcome: 'ok' })).toMatchObject({ memory_id: global['id'] });
    const outside = trackerHarness({ mode, withRepository: false });
    expect(await outside.obj('command_record', { cmd: 'ls', outcome: 'ok' })).toMatchObject({ created: true });
    expect(outside.activityRecords()[1]).not.toHaveProperty('repo_key');
    expect(isWarlogError(await failure(outside.call('command_record', { cmd: 'other', outcome: 'ok', scope: 'repo' })), 'NO_REPO_CONTEXT')).toBe(true);
  });

  it('[WL-19] nothing is recorded without a call, and secrets in an error are rejected', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await h.rows('memory_list');
    await h.obj('playbook', {});
    expect(h.activityRecords().filter((r) => r['entity_type'] === 'memory')).toEqual([]);
    const before = new Map(h.fs.files);
    expect(isWarlogError(await failure(h.call('command_record', { cmd: 'deploy', outcome: 'fail', error: `401 token ghp_${'a'.repeat(36)}` })), 'SECRET_REJECTED')).toBe(true);
    expect(new Map(h.fs.files)).toEqual(before);
  });

  it('[WL-19] issue_resolve resolves an open known issue with its resolution and reference', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const issue = await save(h, { kind: 'known_issue', title: 'win paths', symptom: 'ENOENT' });
    const resolved = await h.obj('issue_resolve', { id: issue['id'], resolution: 'normalized', link: 'https://github.com/scrapup/warlog/pull/6' });
    expect(resolved).toMatchObject({ issue_status: 'resolved', resolution: 'normalized', links: [{ rel: 'relates', target: 'url:https://github.com/scrapup/warlog/pull/6' }] });
    expect(isWarlogError(await failure(h.call('issue_resolve', { id: issue['id'], resolution: 'again' })), 'VALIDATION')).toBe(true);
    const fact = await save(h, { kind: 'fact', title: 'f' });
    expect(isWarlogError(await failure(h.call('issue_resolve', { id: fact['id'], resolution: 'x' })), 'VALIDATION')).toBe(true);
    const other = await save(h, { kind: 'known_issue', title: 'other', symptom: 's' });
    expect((await h.obj('issue_resolve', { id: other['id'], resolution: 'fixed', link: 'git:abc1234' }))['links']).toEqual([{ rel: 'relates', target: 'git:abc1234' }]);
    expect(await h.obj('issue_resolve', { id: (await save(h, { kind: 'known_issue', title: 'third', symptom: 's' }))['id'], resolution: 'x' })).not.toHaveProperty('links');
    expect(isWarlogError(await failure(h.call('issue_resolve', { id: '01J00000000000000000000099', resolution: 'x' })), 'NOT_FOUND')).toBe(true);
  });

  it.each(['PROJ-123', 'http://insecure.example/x', 'file:../../etc/passwd', 'git:XYZ', 'url:javascript:alert(1)', 'two words', 'ftp://x.example/y'])(
    '[WL-21] issue_resolve rejects the reference %p that link_add would reject, and resolves nothing',
    async (link) => {
      const h = trackerHarness({ mode });
      await container(h);
      const issue = await save(h, { kind: 'known_issue', title: 'win paths', symptom: 'ENOENT' });
      const before = new Map(h.fs.files);
      const error = await failure(h.call('issue_resolve', { id: issue['id'], resolution: 'normalized', link }));
      expect(error).toMatchObject({ code: 'VALIDATION', details: { field: 'link' } });
      expect(new Map(h.fs.files)).toEqual(before);
    },
  );

  it('[WL-21] a reference given to issue_resolve can be removed with link_remove, is not added twice and keeps a bare https URL working', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const issue = await save(h, { kind: 'known_issue', title: 'win paths', symptom: 'ENOENT' });
    const resolved = await h.obj('issue_resolve', { id: issue['id'], resolution: 'normalized', link: 'https://github.com/scrapup/warlog/pull/6' });
    expect(resolved['links']).toEqual([{ rel: 'relates', target: 'url:https://github.com/scrapup/warlog/pull/6' }]);
    await h.obj('link_remove', { id: issue['id'], target: 'url:https://github.com/scrapup/warlog/pull/6', rel: 'relates' });
    expect((await h.obj('memory_get', { id: issue['id'] }))['links'] ?? []).toEqual([]);
    const again = await save(h, { kind: 'known_issue', title: 'again', symptom: 's' });
    await h.obj('link_add', { id: again['id'], target: 'git:abc1234', rel: 'relates' });
    expect((await h.obj('issue_resolve', { id: again['id'], resolution: 'fixed', link: 'git:abc1234' }))['links']).toEqual([{ rel: 'relates', target: 'git:abc1234' }]);
  });
});

describe.each(['lazy', 'live'] as const)('playbook (%s index)', (mode) => {
  it('[WL-20] answers run, test, debug and logs: runbooks, commands by status here, open issues, patterns', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const unit = await save(h, { kind: 'command', title: 'unit tests', cmd: 'npm run test:unit', purpose: 'test', known_error: 'jest missing' });
    await save(h, { kind: 'command', title: 'build', cmd: 'npm run build', purpose: 'build' });
    await h.call('command_record', { cmd: 'npm run test:unit', outcome: 'ok' });
    await h.call('command_record', { cmd: 'npm run lint', outcome: 'fail', purpose: 'lint' });
    await save(h, { kind: 'runbook', title: 'run locally', content: '1. npm ci\n2. npm start', purpose: 'run', commands: [unit['id'], '01J00000000000000000000099'] });
    const issue = await save(h, { kind: 'known_issue', title: 'windows path bug', symptom: 'ENOENT', workaround: 'realpath' });
    const solved = await save(h, { kind: 'known_issue', title: 'old bug', symptom: 'x' });
    await h.call('issue_resolve', { id: solved['id'], resolution: 'done' });
    await save(h, { kind: 'pattern', title: 'inject ports', applies_to: ['src/**'] });
    await save(h, { kind: 'pattern', title: 'global style', applies_to: ['**/*.ts'], scope: 'global' });
    const book = await h.obj('playbook', {});
    expect(book['environment']).toEqual({ os: 'linux', node: '22' });
    const commands = book['commands'] as Record<string, Record<string, unknown>[]>;
    expect(commands['works']?.map((c) => [c['cmd'], c['status'], c['known_error']])).toEqual([['npm run test:unit', 'works', 'jest missing']]);
    expect(commands['fails']?.map((c) => c['cmd'])).toEqual(['npm run lint']);
    expect(commands['unverified']?.map((c) => c['cmd'])).toEqual(['npm run build']);
    expect(commands['flaky']).toEqual([]);
    expect(commands['works']?.[0]?.['environments']).toEqual([expect.objectContaining({ os: 'linux', node: '22', status: 'works' })]);
    expect((book['runbooks'] as Record<string, unknown>[])[0]).toMatchObject({ title: 'run locally', purpose: 'run', content: '1. npm ci\n2. npm start', commands: [{ id: unit['id'], cmd: 'npm run test:unit' }, { id: '01J00000000000000000000099', missing: true }] });
    expect((book['known_issues'] as Record<string, unknown>[]).map((i) => i['id'])).toEqual([issue['id']]);
    expect((book['patterns'] as Record<string, unknown>[]).map((p) => p['title'])).toEqual(['inject ports', 'global style']);
  });

  it('[WL-20] a topic focuses the playbook; observations made in the session show at once', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await save(h, { kind: 'command', title: 'unit tests', cmd: 'npm run test:unit', purpose: 'test' });
    await save(h, { kind: 'command', title: 'logs', cmd: 'tail -f app.log', purpose: 'logs' });
    await save(h, { kind: 'runbook', title: 'debug flow', purpose: 'debug', content: 'attach' });
    await save(h, { kind: 'known_issue', title: 'test flake', symptom: 'timeout' });
    const focused = await h.obj('playbook', { topic: 'test' });
    expect(focused['topic']).toBe('test');
    const commands = focused['commands'] as Record<string, Record<string, unknown>[]>;
    expect(Object.values(commands).flat().map((c) => c['cmd'])).toEqual(['npm run test:unit']);
    expect(focused['runbooks']).toEqual([]);
    expect((focused['known_issues'] as unknown[]).length).toBe(1);
    expect(((await h.obj('playbook', { topic: 'logs' }))['commands'] as Record<string, unknown[]>)['unverified']).toHaveLength(1);
    expect((await h.obj('playbook', { topic: 'debug' }))['runbooks']).toHaveLength(1);
    await h.call('command_record', { cmd: 'tail -f app.log', outcome: 'ok' });
    expect(((await h.obj('playbook', { topic: 'logs' }))['commands'] as Record<string, unknown[]>)['works']).toHaveLength(1);
    expect(Object.values((await h.obj('playbook', { limit: 1 }))['commands'] as Record<string, unknown[]>).flat()).toHaveLength(1);
  });

  it('[WL-20] patterns_for returns the patterns whose globs match the file, repository first', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await save(h, { kind: 'pattern', title: 'domain handlers', content: 'one per operation', applies_to: ['src/domain/**/*.handler.ts'], example: 'class X {}' });
    await save(h, { kind: 'pattern', title: 'any ts', applies_to: ['**/*.ts', 'docs/*.md'], scope: 'global' });
    await save(h, { kind: 'pattern', title: 'tests', applies_to: ['test/**'] });
    const archived = await save(h, { kind: 'pattern', title: 'archived', applies_to: ['src/**'] });
    await h.call('memory_archive', { id: archived['id'] });
    const found = await h.obj('patterns_for', { path: './src/domain/task/task-create.handler.ts' });
    expect(found).toMatchObject({ path: 'src/domain/task/task-create.handler.ts', count: 2 });
    expect((found['patterns'] as Record<string, unknown>[]).map((p) => [p['title'], p['scope']])).toEqual([
      ['domain handlers', 'repo'],
      ['any ts', 'global'],
    ]);
    expect((found['patterns'] as Record<string, unknown>[])[0]).toMatchObject({ content: 'one per operation', example: 'class X {}' });
    expect((await h.obj('patterns_for', { path: 'test/unit/a.test.ts' }))['count']).toBe(2);
    expect((await h.obj('patterns_for', { path: 'docs/readme.md' }))['count']).toBe(1);
    expect((await h.obj('patterns_for', { path: 'README' }))['count']).toBe(0);
    expect((await h.obj('patterns_for', { path: `${String(h.roots.repository?.mainWorktree)}/src/domain/x.handler.ts` }))['path']).toBe('src/domain/x.handler.ts');
    expect(isWarlogError(await failure(h.call('patterns_for', { path: '' })), 'VALIDATION')).toBe(true);
  });
});

describe('patterns_for paths', () => {
  it('[WL-20] normalizes separators, a leading ./ and the working tree prefix', () => {
    expect(relativePath('src\\a\\b.ts', undefined)).toBe('src/a/b.ts');
    expect(relativePath('./a.ts', undefined)).toBe('a.ts');
    expect(relativePath('/work/repo/a/b.ts', '/work/repo')).toBe('a/b.ts');
    expect(relativePath('C:\\work\\repo\\a.ts', 'C:\\work\\repo\\')).toBe('a.ts');
    expect(relativePath('/other/a.ts', '/work/repo')).toBe('/other/a.ts');
  });
});
