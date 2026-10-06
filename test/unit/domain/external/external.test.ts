import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

const MISSING = '01J00000000000000000000099';

describe.each(['lazy', 'live'] as const)('external references (%s index)', (mode) => {
  it('[WL-23] epics, stories and tasks hold references that find them by system and key', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const story = String((await h.obj('story_create', { project_id: projectId, title: 'S' }))['id']);
    const t = String((await task(h, epicId, 'T'))['id']);
    expect(await h.obj('external_link', { id: t, system: 'jira', key: 'SQ-1', url: 'https://example.atlassian.net/browse/SQ-1' })).toEqual({
      message: 'Reference linked.',
      id: t,
      external: { system: 'jira', key: 'SQ-1', url: 'https://example.atlassian.net/browse/SQ-1' },
    });
    await h.call('external_link', { id: t, system: 'clickup', key: 'CU-9' });
    await h.call('external_link', { id: epicId, system: 'jira', key: 'SQ-100' });
    await h.call('external_link', { id: story, system: 'github', key: 'scrapup/warlog#12' });
    expect(await h.obj('find_by_external', { system: 'jira', key: 'SQ-1' })).toMatchObject({
      id: t,
      type: 'task',
      label: 'T',
      status: 'todo',
      project_id: projectId,
      external: [
        { system: 'jira', key: 'SQ-1', url: 'https://example.atlassian.net/browse/SQ-1' },
        { system: 'clickup', key: 'CU-9' },
      ],
    });
    expect(await h.obj('find_by_external', { system: 'jira', key: 'SQ-100' })).toMatchObject({ id: epicId, type: 'epic' });
    expect(await h.obj('find_by_external', { system: 'github', key: 'scrapup/warlog#12' })).toMatchObject({ id: story, type: 'story' });
    expect(isWarlogError(await failure(h.call('find_by_external', { system: 'jira', key: 'SQ-404' })), 'NOT_FOUND')).toBe(true);
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'updated', field: 'external' });
  });

  it('[WL-23] a key belongs to one item; relinking updates the URL and an identical link changes nothing', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = String((await task(h, epicId, 'A'))['id']);
    const b = String((await task(h, epicId, 'B'))['id']);
    await h.call('external_link', { id: a, system: 'jira', key: 'SQ-1' });
    const rev = (await h.obj('task_get', { id: a }))['rev'];
    expect(await h.obj('external_link', { id: a, system: 'jira', key: 'SQ-1' })).toMatchObject({ message: 'Reference already linked.' });
    expect((await h.obj('task_get', { id: a }))['rev']).toBe(rev);
    expect(await h.obj('external_link', { id: a, system: 'jira', key: 'SQ-1', url: 'https://x.example/SQ-1' })).toMatchObject({ message: 'Reference linked.', external: { url: 'https://x.example/SQ-1' } });
    expect(((await h.obj('task_get', { id: a }))['external'] as unknown[]).length).toBe(1);
    expect(isWarlogError(await failure(h.call('external_link', { id: b, system: 'jira', key: 'SQ-1' })), 'VALIDATION')).toBe(true);
    expect(await h.obj('external_link', { id: b, system: 'clickup', key: 'SQ-1' })).toMatchObject({ message: 'Reference linked.' });
  });

  it('[WL-23] unlink removes one reference; other types, bad input and unknown items are refused', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = String((await task(h, epicId, 'T'))['id']);
    await h.call('external_link', { id: t, system: 'jira', key: 'SQ-1' });
    await h.call('external_link', { id: t, system: 'jira', key: 'SQ-2' });
    expect(await h.obj('external_unlink', { id: t, system: 'jira', key: 'SQ-1' })).toMatchObject({ message: 'Reference unlinked.' });
    expect((await h.obj('task_get', { id: t }))['external']).toEqual([{ system: 'jira', key: 'SQ-2' }]);
    await h.call('external_unlink', { id: t, system: 'jira', key: 'SQ-2' });
    expect(await h.obj('task_get', { id: t })).not.toHaveProperty('external');
    expect(isWarlogError(await failure(h.call('external_unlink', { id: t, system: 'jira', key: 'SQ-2' })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('external_unlink', { id: MISSING, system: 'jira', key: 'SQ-2' })), 'NOT_FOUND')).toBe(true);
    const memory = String((await h.obj('memory_save', { kind: 'fact', title: 'f', content: 'c' }))['id']);
    expect(isWarlogError(await failure(h.call('external_link', { id: memory, system: 'jira', key: 'SQ-3' })), 'VALIDATION')).toBe(true);
    for (const bad of [{ system: 'Jira', key: 'k' }, { system: '', key: 'k' }, { system: 'jira', key: ' ' }, { system: 'jira', key: 'a\u0001b' }, { system: 'jira', key: 'k', url: 'http://insecure' }, { system: 'jira', key: 'k', url: 'https://a b' }, { system: 'j'.repeat(33), key: 'k' }]) {
      expect(isWarlogError(await failure(h.call('external_link', { id: t, ...bad })), 'VALIDATION')).toBe(true);
    }
    expect(isWarlogError(await failure(h.call('external_link', { id: MISSING, system: 'jira', key: 'SQ-5' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-23] an item holds a bounded number of references', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = String((await task(h, epicId, 'T'))['id']);
    for (let i = 0; i < 20; i += 1) {
      await h.call('external_link', { id: t, system: 'jira', key: `SQ-${i}` });
    }
    expect(isWarlogError(await failure(h.call('external_link', { id: t, system: 'jira', key: 'SQ-20' })), 'VALIDATION')).toBe(true);
  }, 30_000);

  it('[WL-23] a deleted item is not found by its key', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = String((await task(h, epicId, 'T'))['id']);
    await h.call('external_link', { id: t, system: 'jira', key: 'SQ-1' });
    await h.call('task_delete', { id: t });
    expect(isWarlogError(await failure(h.call('find_by_external', { system: 'jira', key: 'SQ-1' })), 'NOT_FOUND')).toBe(true);
  });
});

/**
 * Lists the TypeScript sources under a directory.
 * @param dir - Directory.
 * @returns File paths.
 */
function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath, e.name));
}

describe('no network access', () => {
  it('[WL-24] nothing in src imports an HTTP client or calls fetch: warlog only references trackers', () => {
    const forbidden = [/from 'node:https?'/, /from 'https?'/, /from 'node:net'/, /from 'node:tls'/, /from 'node:dgram'/, /from 'node:dns'/, /from 'undici'/, /from 'axios'/, /\bfetch\(/, /XMLHttpRequest/, /new WebSocket\(/];
    const offenders = sources('src').flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return forbidden.filter((re) => re.test(text)).map((re) => `${file}: ${String(re)}`);
    });
    expect(offenders).toEqual([]);
  });

  it('[WL-24] the package declares no HTTP client dependency', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(manifest.dependencies).filter((d) => ['axios', 'undici', 'node-fetch', 'got', 'superagent', 'request'].includes(d))).toEqual([]);
  });
});
