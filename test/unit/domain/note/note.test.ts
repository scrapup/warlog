import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { excerpt, matchesAll, tokensOf } from '../../../../src/domain/shared/text-search.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

describe('literal text search', () => {
  it('[WL-47] matches every token literally and case-insensitively, never as a pattern', () => {
    expect(tokensOf('  Deploy  .*Fails ')).toEqual(['deploy', '.*fails']);
    expect(matchesAll(tokensOf('deploy fails'), 'The DEPLOY step fails on Windows')).toBe(true);
    expect(matchesAll(tokensOf('deploy .*'), 'The deploy step fails')).toBe(false);
    expect(matchesAll(tokensOf('a+b'), 'computes a+b')).toBe(true);
    expect(matchesAll([], 'anything')).toBe(false);
  });

  it('builds single-line excerpts of at most 120 characters', () => {
    expect(excerpt('line one\n\nline   two')).toBe('line one line two');
    expect(excerpt('x'.repeat(200))).toBe(`${'x'.repeat(120)}…`);
  });
});

describe.each(['lazy', 'live'] as const)('note operations (%s index)', (mode) => {
  it('[WL-10] note_save creates in the related project, upserts by id and lists newest first', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    const n1 = await h.obj('note_save', { title: 'Decision', content: 'Use trunk', note_type: 'decision', related_entity_type: 'project', related_entity_id: projectId });
    expect(n1).toMatchObject({ project_id: projectId, note_type: 'decision', content: 'Use trunk' });
    expect([...h.fs.files.keys()].some((p) => p.endsWith(`/projects/${projectId}/notes/${String(n1['id'])}.md`))).toBe(true);
    const n2 = await h.obj('note_save', { title: 'Loose', content: 'General thought' });
    expect(n2).toMatchObject({ note_type: 'general' });
    expect(n2).not.toHaveProperty('project_id');
    await h.obj('note_save', { title: 'On task', content: 'Breadcrumb', related_entity_type: 'task', related_entity_id: t['id'], tags: ['rt'] });
    const updated = await h.obj('note_save', { id: n1['id'], title: 'Decision v2', content: 'Use trunk-based' });
    expect(updated).toMatchObject({ title: 'Decision v2', content: 'Use trunk-based', rev: 2, project_id: projectId });
    expect((await h.rows('note_list')).map((r) => r['title'])).toEqual(['On task', 'Loose', 'Decision v2']);
    expect((await h.rows('note_list'))[0]).toMatchObject({ excerpt: 'Breadcrumb' });
    expect((await h.rows('note_list', { note_type: 'decision' })).map((r) => r['title'])).toEqual(['Decision v2']);
    expect((await h.rows('note_list', { related_entity_type: 'task', related_entity_id: t['id'] })).map((r) => r['title'])).toEqual(['On task']);
    expect((await h.rows('note_list', { tag: 'rt' })).length).toBe(1);
    expect((await h.rows('note_list', { limit: 1 })).length).toBe(1);
    expect(((await h.obj('task_get', { id: t['id'] }))['notes'] as Record<string, unknown>[]).map((n) => n['content'])).toEqual(['Breadcrumb']);
    expect(isWarlogError(await failure(h.call('note_save', { id: '01J00000000000000000000099', title: 'x', content: 'y' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-10] note_list with a project scope keeps that project and unrelated notes', async () => {
    const h = trackerHarness({ mode });
    const a = await container(h);
    const b = await container(h);
    await h.call('note_save', { title: 'A', content: '.', related_entity_type: 'epic', related_entity_id: a.epicId });
    await h.call('note_save', { title: 'B', content: '.', related_entity_type: 'epic', related_entity_id: b.epicId });
    await h.call('note_save', { title: 'free', content: '.' });
    expect((await h.rows('note_list', { project_id: a.projectId })).map((r) => r['title'])).toEqual(['free', 'A']);
  });

  it('[WL-44] a note related to an entity not present yet is kept with its pending reference', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const n = await h.obj('note_save', { title: 'early', content: '.', related_entity_type: 'task', related_entity_id: '01J00000000000000000000099' });
    expect(n).toMatchObject({ related_entity_id: '01J00000000000000000000099' });
    expect(n).not.toHaveProperty('project_id');
  });

  it('[WL-47] note_search matches literal words in title and content', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await h.call('note_save', { title: 'Windows CI', content: 'git prints forward slashes', note_type: 'technical' });
    await h.call('note_save', { title: 'Release', content: 'release-please token', note_type: 'release' });
    expect((await h.rows('note_search', { query: 'windows SLASHES' })).map((r) => r['title'])).toEqual(['Windows CI']);
    expect((await h.rows('note_search', { query: 'release.*' })).length).toBe(0);
    expect((await h.rows('note_search', { query: 'release', note_type: 'technical' })).length).toBe(0);
    expect(isWarlogError(await failure(h.call('note_search', { query: '   ' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-08] note_delete is soft and note_restore brings the note back', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const n = await h.obj('note_save', { title: 'temp', content: 'x' });
    expect(await h.obj('note_delete', { id: n['id'] })).toEqual({ id: n['id'], title: 'temp', deleted: true });
    expect(await h.rows('note_list')).toEqual([]);
    expect(await h.rows('note_search', { query: 'temp' })).toEqual([]);
    expect(await h.obj('note_delete', { id: n['id'] })).toEqual({ id: n['id'], title: 'temp', deleted: true });
    expect([...h.fs.files.values()].some((c) => c.includes('title: temp'))).toBe(true);
    expect((await h.obj('note_restore', { id: n['id'] }))['message']).toBe(`Note ${String(n['id'])} restored.`);
    expect((await h.rows('note_list')).length).toBe(1);
    expect((await h.obj('note_restore', { id: n['id'] }))['message']).toBe(`Note ${String(n['id'])} is not deleted — nothing to restore.`);
    expect(h.activityRecords().map((r) => r['action'])).toEqual(['created', 'created', 'created', 'deleted', 'restored']);
  });
});
