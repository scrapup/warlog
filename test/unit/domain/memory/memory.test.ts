import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { norm } from '../../../support/fakes/path-map.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure } from '../../../support/tracker-setup.ts';

/**
 * Saves a memory.
 * @param h - Harness.
 * @param input - Fields.
 * @returns The stored memory.
 */
async function save(h: TrackerHarness, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return h.obj('memory_save', input);
}

describe.each(['lazy', 'live'] as const)('memory model (%s index)', (mode) => {
  it('[WL-15] every kind carries its own fields, validated', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    expect(await save(h, { kind: 'fact', title: 'Node 22', content: 'engines >=22' })).toMatchObject({ kind: 'fact', status: 'active', scope: 'repo', content: 'engines >=22', tags: [] });
    expect(await save(h, { kind: 'decision', title: 'trunk-based', content: 'why', tags: ['git'] })).toMatchObject({ kind: 'decision', tags: ['git'] });
    expect(await save(h, { kind: 'guardrail', title: 'no force push', content: 'x' })).toMatchObject({ kind: 'guardrail' });
    expect(await save(h, { kind: 'pattern', title: 'ports', content: 'inject', applies_to: ['src/domain/**', 'test/*.ts'], example: 'new X(deps)' })).toMatchObject({ kind: 'pattern', applies_to: ['src/domain/**', 'test/*.ts'], example: 'new X(deps)' });
    expect(await save(h, { kind: 'command', title: 'unit', content: '', cmd: 'npm run test:unit', purpose: 'test', known_error: 'jest missing' })).toMatchObject({ kind: 'command', cmd: 'npm run test:unit', purpose: 'test' });
    expect(await save(h, { kind: 'command', title: 'other', content: '', cmd: 'ls' })).toMatchObject({ purpose: 'other' });
    expect(await save(h, { kind: 'known_issue', title: 'win paths', content: 'details', symptom: 'ENOENT', cause: '8.3 names', workaround: 'realpath' })).toMatchObject({ kind: 'known_issue', issue_status: 'open', symptom: 'ENOENT' });
    expect(await save(h, { kind: 'runbook', title: 'run it', content: '1. build', purpose: 'run', commands: ['01J00000000000000000000099'] })).toMatchObject({ kind: 'runbook', purpose: 'run' });
  });

  it('[WL-15] missing, misplaced or malformed kind fields are VALIDATION errors listing each field', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const issues = async (input: Record<string, unknown>): Promise<unknown[]> => {
      const error = await failure(h.call('memory_save', input));
      return isWarlogError(error, 'VALIDATION') ? (error.details?.['issues'] as unknown[]) : [];
    };
    expect(await issues({ kind: 'pattern', title: 't', content: 'c' })).toEqual([{ path: 'applies_to', message: 'is required for kind pattern' }]);
    expect(await issues({ kind: 'command', title: 't', content: 'c' })).toEqual([{ path: 'cmd', message: 'is required for kind command' }]);
    expect(await issues({ kind: 'known_issue', title: 't', content: 'c' })).toEqual([{ path: 'symptom', message: 'is required for kind known_issue' }]);
    expect(await issues({ kind: 'runbook', title: 't', content: 'c', purpose: 'test' })).toEqual([{ path: 'purpose', message: 'must be one of run, debug, logs, deploy for a runbook' }]);
    expect(await issues({ kind: 'runbook', title: 't', content: 'c' })).toEqual([{ path: 'purpose', message: 'is required for kind runbook' }]);
    expect(await issues({ kind: 'fact', title: 't', content: 'c', cmd: 'x', symptom: 'y' })).toEqual([
      { path: 'cmd', message: 'does not apply to kind fact' },
      { path: 'symptom', message: 'does not apply to kind fact' },
    ]);
    expect(await issues({ title: 't' })).toEqual([
      { path: 'kind', message: 'is required on creation' },
      { path: 'content', message: 'is required on creation' },
    ]);
    expect(isWarlogError(await failure(h.call('memory_save', { kind: 'pattern', title: 't', content: 'c', applies_to: ['x'.repeat(300)] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_save', { kind: 'runbook', title: 't', content: 'c', purpose: 'run', commands: ['nope'] })), 'VALIDATION')).toBe(true);
  });

  it('[WL-16] memories live at repository or global scope', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const repo = await save(h, { kind: 'fact', title: 'repo fact', content: 'a' });
    const global = await save(h, { kind: 'fact', title: 'global fact', content: 'b', scope: 'global' });
    expect(global['scope']).toBe('global');
    expect([...h.fs.files.keys()].some((p) => p.endsWith(norm(join('memories', `${String(repo['id'])}.md`))) && p.includes('.warlog'))).toBe(true);
    expect([...h.fs.files.keys()].some((p) => p.endsWith(norm(join('global', 'memories', `${String(global['id'])}.md`))))).toBe(true);
    expect((await h.obj('memory_get', { id: global['id'] }))['scope']).toBe('global');
    expect((await h.obj('memory_get', { id: repo['id'] }))).toMatchObject({ scope: 'repo', content: 'a' });
    expect(isWarlogError(await failure(h.call('memory_get', { id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
    const outside = trackerHarness({ mode, withRepository: false });
    expect(await save(outside, { kind: 'fact', title: 'no repo', content: 'x' })).toMatchObject({ scope: 'global' });
    expect(isWarlogError(await failure(outside.call('memory_save', { kind: 'fact', title: 'x', content: 'y', scope: 'repo' })), 'NO_REPO_CONTEXT')).toBe(true);
  });

  it('[WL-15] a memory is updated by id: fields change, kind and scope do not', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const m = await save(h, { kind: 'known_issue', title: 'issue', content: 'c', symptom: 's' });
    expect(await save(h, { id: m['id'], title: 'issue v2', symptom: 's2', cause: 'why', tags: ['t'] })).toMatchObject({ title: 'issue v2', symptom: 's2', cause: 'why', tags: ['t'], content: 'c', rev: 2, status: 'active' });
    expect(await save(h, { id: m['id'], content: 'new body' })).toMatchObject({ content: 'new body', rev: 3 });
    expect(isWarlogError(await failure(h.call('memory_save', { id: m['id'], kind: 'fact' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_save', { id: m['id'], scope: 'global' })), 'VALIDATION')).toBe(true);
    expect(await save(h, { id: m['id'], kind: 'known_issue', scope: 'repo', title: 'same' })).toMatchObject({ title: 'same' });
    expect(isWarlogError(await failure(h.call('memory_save', { id: m['id'], cmd: 'x' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_save', { id: m['id'] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_save', { id: '01J00000000000000000000099', title: 'x' })), 'NOT_FOUND')).toBe(true);
    const runbook = await save(h, { kind: 'runbook', title: 'r', content: 'c', purpose: 'run' });
    expect(isWarlogError(await failure(h.call('memory_save', { id: runbook['id'], purpose: 'test' })), 'VALIDATION')).toBe(true);
    expect(await save(h, { id: runbook['id'], purpose: 'logs' })).toMatchObject({ purpose: 'logs' });
  });

  it('[WL-15] one command memory per command line and scope', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await save(h, { kind: 'command', title: 'a', content: '', cmd: 'make' });
    expect(isWarlogError(await failure(h.call('memory_save', { kind: 'command', title: 'b', content: '', cmd: 'make' })), 'VALIDATION')).toBe(true);
    expect(await save(h, { kind: 'command', title: 'b', content: '', cmd: 'make', scope: 'global' })).toMatchObject({ scope: 'global' });
  });

  it('[WL-09] secret-like memory content is rejected before writing', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const before = new Map(h.fs.files);
    expect(isWarlogError(await failure(h.call('memory_save', { kind: 'fact', title: 'token', content: `use ghp_${'a'.repeat(36)}` })), 'SECRET_REJECTED')).toBe(true);
    expect(new Map(h.fs.files)).toEqual(before);
  });

  it('[WL-15] memory_list shows active and stale by default, repository first, with filters', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const g = await save(h, { kind: 'fact', title: 'global', content: 'g', scope: 'global', tags: ['x'] });
    h.clock.advance(1000);
    const r1 = await save(h, { kind: 'guardrail', title: 'older repo', content: 'r1' });
    h.clock.advance(1000);
    const r2 = await save(h, { kind: 'fact', title: 'newer repo', content: 'r2', tags: ['x'] });
    await h.call('memory_archive', { id: r1['id'] });
    const titles = async (input: Record<string, unknown> = {}): Promise<unknown[]> => (await h.rows('memory_list', input)).map((r) => r['title']);
    expect(await titles()).toEqual(['newer repo', 'global']);
    expect(await titles({ status: 'archived' })).toEqual(['older repo']);
    expect(await titles({ scope: 'global' })).toEqual(['global']);
    expect(await titles({ kind: 'fact', tag: 'x' })).toEqual(['newer repo', 'global']);
    expect(await titles({ limit: 1 })).toEqual(['newer repo']);
    expect((await h.rows('memory_list'))[0]).toMatchObject({ id: r2['id'], excerpt: 'r2', tags: ['x'] });
    expect(g['id']).toBeDefined();
  });
});
