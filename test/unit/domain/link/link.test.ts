import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { isRelativePath, parseLinkTarget } from '../../../../src/domain/link/link-target-parser.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

const MISSING = '01J00000000000000000000099';

describe('link target parser', () => {
  it.each([
    ['01J00000000000000000000001', 'entity'],
    ['spec:docs/specs/warlog/spec.md#wl-21', 'spec'],
    ['spec:docs/spec.md', 'spec'],
    ['git:abc1234', 'git'],
    ['git:' + 'f'.repeat(40), 'git'],
    ['test:test/unit/a.test.ts::[WL-21] links both ways', 'test'],
    ['file:src/a.ts', 'file'],
    ['file:src/a.ts:42', 'file'],
    ['url:https://github.com/scrapup/warlog/pull/1', 'url'],
  ])('[WL-21] accepts %s as %s', (text, kind) => {
    expect(parseLinkTarget(text)).toEqual({ kind, text });
  });

  it.each([
    'plain text',
    '01J0000000000000000000000',
    'spec:',
    'spec:../secret.md',
    'spec:/etc/passwd',
    'spec:docs\\spec.md',
    'spec:docs/a.md#',
    'spec:a\u0000b',
    'git:abc12',
    'git:ABCDEF1',
    'git:zzzzzzz',
    'git:' + 'a'.repeat(65),
    'test:file.ts',
    'test:file.ts::',
    'test:../x.ts::name',
    'file:',
    'file:src/a.ts:0',
    'file:../a.ts:3',
    'url:http://insecure.example',
    'url:https://',
    'url:https://a b',
    'url:ftp://x',
    'ssh:host',
    `spec:${'a'.repeat(2_100)}`,
  ])('[WL-21] rejects %j', (text) => {
    expect(parseLinkTarget(text)).toBeUndefined();
  });

  it('[WL-48] stays linear on adversarial input', () => {
    const started = performance.now();
    parseLinkTarget(`spec:${'#'.repeat(1_000)}${':'.repeat(1_000)}`);
    parseLinkTarget(`file:${'1'.repeat(1_000)}:${'1'.repeat(1_000)}`);
    expect(performance.now() - started).toBeLessThan(200);
    expect(isRelativePath('a/b/../c')).toBe(false);
    expect(isRelativePath('a/..b/c')).toBe(true);
  });
});

/**
 * Creates a project, epic and two tasks.
 * @param h - Harness.
 * @returns Their ids.
 */
async function graph(h: TrackerHarness): Promise<{ a: string; b: string; epicId: string }> {
  const { epicId } = await container(h);
  return { a: String((await task(h, epicId, 'A'))['id']), b: String((await task(h, epicId, 'B'))['id']), epicId };
}

describe.each(['lazy', 'live'] as const)('links (%s index)', (mode) => {
  it('[WL-21] a link is navigable in both directions, between entities and to external references', async () => {
    const h = trackerHarness({ mode });
    const { a, b } = await graph(h);
    expect(await h.obj('link_add', { id: a, rel: 'relates', target: b })).toMatchObject({ message: 'Link added.', id: a, rel: 'relates', target: b, pending: false });
    await h.call('link_add', { id: a, rel: 'implements', target: 'spec:docs/specs/warlog/spec.md#wl-21' });
    await h.call('link_add', { id: b, rel: 'tests', target: 'test:test/unit/link.test.ts::both ways' });
    await h.call('link_add', { id: a, rel: 'commit', target: 'git:0123abc' });
    await h.call('link_add', { id: b, rel: 'commit', target: 'git:0123abc' });
    const out = await h.rows('links_of', { id: a, direction: 'out' });
    expect(out.map((r) => [r['direction'], r['rel'], r['type'], r['id']])).toEqual([
      ['out', 'relates', 'task', b],
      ['out', 'implements', 'spec', 'spec:docs/specs/warlog/spec.md#wl-21'],
      ['out', 'commit', 'git', 'git:0123abc'],
    ]);
    expect(out[0]).toMatchObject({ label: 'B', status: 'todo' });
    expect((await h.rows('links_of', { id: b, direction: 'in' })).map((r) => [r['direction'], r['rel'], r['id'], r['label']])).toEqual([['in', 'relates', a, 'A']]);
    expect((await h.rows('links_of', { id: b })).map((r) => `${String(r['direction'])} ${String(r['rel'])}`)).toEqual(['out tests', 'out commit', 'in relates']);
    expect((await h.rows('links_of', { id: 'git:0123abc' })).map((r) => [r['direction'], r['rel'], r['label']]).sort()).toEqual([
      ['in', 'commit', 'A'],
      ['in', 'commit', 'B'],
    ]);
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'updated', field: 'links' });
  });

  it('[WL-21] adding an existing link changes nothing; removing needs an existing link', async () => {
    const h = trackerHarness({ mode });
    const { a, b } = await graph(h);
    await h.call('link_add', { id: a, rel: 'relates', target: b });
    const before = await h.obj('task_get', { id: a });
    expect(await h.obj('link_add', { id: a, rel: 'relates', target: b })).toMatchObject({ message: 'Link already exists.' });
    expect((await h.obj('task_get', { id: a }))['rev']).toBe(before['rev']);
    expect(await h.obj('link_remove', { id: a, rel: 'relates', target: b })).toMatchObject({ message: 'Link removed.' });
    expect((await h.obj('task_get', { id: a }))).not.toHaveProperty('links');
    expect(await h.rows('links_of', { id: b })).toEqual([]);
    expect(isWarlogError(await failure(h.call('link_remove', { id: a, rel: 'relates', target: b })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('link_remove', { id: MISSING, rel: 'relates', target: b })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-21] unknown relations and malformed targets are VALIDATION errors; a self link is refused', async () => {
    const h = trackerHarness({ mode });
    const { a } = await graph(h);
    expect(isWarlogError(await failure(h.call('link_add', { id: a, rel: 'blocks', target: 'git:abc1234' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('link_add', { id: a, rel: 'relates', target: 'jira:ABC-1' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('link_add', { id: a, rel: 'relates', target: a })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('link_add', { id: MISSING, rel: 'relates', target: 'git:abc1234' })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('links_of', { id: MISSING })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-44] a link to an entity not present yet is kept as pending, reported by doctor, and resolves when it appears', async () => {
    const h = trackerHarness({ mode });
    const { a } = await graph(h);
    expect(await h.obj('link_add', { id: a, rel: 'derived_from', target: MISSING })).toMatchObject({ pending: true, message: 'Link added; the target is not in the store yet (pending).' });
    expect(h.warnings).toContain('link.pending_target');
    expect((await h.rows('links_of', { id: a }))[0]).toMatchObject({ rel: 'derived_from', type: 'pending', pending: true, id: MISSING });
    expect((await h.view()).pendingLinks()).toEqual([{ from: a, rel: 'derived_from', target: MISSING }]);
    expect((await h.rows('links_of', { id: MISSING, direction: 'in' }))[0]).toMatchObject({ direction: 'in', rel: 'derived_from', id: a });
  });

  it('[WL-21] links work on every entity type and are limited per entity', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await graph(h);
    const memory = await h.obj('memory_save', { kind: 'decision', title: 'd', content: 'c' });
    expect(await h.obj('link_add', { id: memory['id'], rel: 'derived_from', target: epicId })).toMatchObject({ message: 'Link added.' });
    expect((await h.rows('links_of', { id: epicId, direction: 'in' }))[0]).toMatchObject({ type: 'memory', rel: 'derived_from' });
    for (let i = 0; i < 199; i += 1) {
      await h.call('link_add', { id: epicId, rel: 'relates', target: `git:${String(i).padStart(7, '0')}` });
    }
    await h.call('link_add', { id: epicId, rel: 'relates', target: 'git:fffffff' });
    expect(isWarlogError(await failure(h.call('link_add', { id: epicId, rel: 'relates', target: 'git:eeeeeee' })), 'VALIDATION')).toBe(true);
  }, 60_000);
});
