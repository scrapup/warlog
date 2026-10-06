import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { matchedTokens, tokenSet, wordTokens } from '../../../../src/domain/memory/token-matcher.ts';
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
  return h.obj('memory_save', { content: '', ...input });
}

/**
 * Titles of recalled memories, in order.
 * @param h - Harness.
 * @param input - Recall input.
 * @returns Titles.
 */
async function recalled(h: TrackerHarness, input: Record<string, unknown>): Promise<unknown[]> {
  return ((await h.obj('memory_recall', input))['results'] as Record<string, unknown>[]).map((r) => r['title']);
}

describe('word tokens', () => {
  it('[WL-47] splits text into lower-case words by one scan and never treats it as a pattern', () => {
    expect(wordTokens("Windows .*  C:\\Users\\x — naïve_café 12-3 (a+b)")).toEqual(['windows', 'c', 'users', 'x', 'naïve_café', '12', '3', 'a', 'b']);
    expect(wordTokens('')).toEqual([]);
    expect(wordTokens('...')).toEqual([]);
    expect(matchedTokens(['a', 'z'], tokenSet('a b a'))).toBe(1);
    expect(wordTokens('x '.repeat(50_000)).length).toBe(50_000);
  });
});

describe.each(['lazy', 'live'] as const)('memory recall (%s index)', (mode) => {
  it('[WL-16] ranks by scope specificity, then matched words, then recency', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await save(h, { kind: 'fact', title: 'windows path separators', scope: 'global' });
    h.clock.advance(1000);
    await save(h, { kind: 'fact', title: 'windows only', scope: 'repo' });
    h.clock.advance(1000);
    await save(h, { kind: 'fact', title: 'windows path separators in git output', scope: 'repo' });
    h.clock.advance(1000);
    await save(h, { kind: 'fact', title: 'windows path newest', scope: 'repo' });
    expect(await recalled(h, { query: 'Windows PATH separators' })).toEqual(['windows path separators in git output', 'windows path newest', 'windows only', 'windows path separators']);
    expect(await recalled(h, { query: 'windows', limit: 2 })).toEqual(['windows path newest', 'windows path separators in git output']);
    expect(await recalled(h, { query: 'windows', scope: 'global' })).toEqual(['windows path separators']);
    expect(await recalled(h, { query: 'nothing matches this' })).toEqual([]);
  });

  it('[WL-16] filters by kind, tags and status; archived and superseded memories are not recalled', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const a = await save(h, { kind: 'known_issue', title: 'flaky test', symptom: 'timeout', tags: ['ci', 'win'] });
    await save(h, { kind: 'fact', title: 'flaky network', tags: ['ci'] });
    const old = await save(h, { kind: 'fact', title: 'flaky old' });
    const stale = await save(h, { kind: 'fact', title: 'flaky stale' });
    await h.call('memory_archive', { id: old['id'] });
    await h.call('memory_mark_stale', { id: stale['id'] });
    expect((await recalled(h, { query: 'flaky' })).sort()).toEqual(['flaky network', 'flaky stale', 'flaky test']);
    expect(await recalled(h, { query: 'flaky', kind: 'known_issue' })).toEqual(['flaky test']);
    expect(await recalled(h, { query: 'flaky', tags: ['ci', 'win'] })).toEqual(['flaky test']);
    expect(await recalled(h, { query: 'timeout' })).toEqual(['flaky test']);
    const result = await h.obj('memory_recall', { query: 'flaky', kind: 'known_issue' });
    expect(result).toMatchObject({ count: 1, results: [{ id: a['id'], matched: 1, symptom: 'timeout' }] });
  });

  it('[WL-47] the query is matched literally: patterns find nothing and words match exactly', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await save(h, { kind: 'fact', title: 'regex tips', content: 'use a+b carefully' });
    expect(await recalled(h, { query: '.*' })).toEqual([]);
    expect(await recalled(h, { query: '(regex' })).toEqual(['regex tips']);
    expect(await recalled(h, { query: 'reg' })).toEqual([]);
    expect(await recalled(h, { query: 'a+b' })).toEqual(['regex tips']);
    expect(isWarlogError(await failure(h.call('memory_recall', { query: 'x'.repeat(1_001) })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_recall', { query: '   ' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-18] a recall is recorded as activity per memory and never rewrites the memory file', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const m = await save(h, { kind: 'fact', title: 'remember me', content: 'body', scope: 'global' });
    const r = await save(h, { kind: 'fact', title: 'remember me too', content: 'body' });
    const files = new Map(h.fs.files);
    await recalled(h, { query: 'remember' });
    await recalled(h, { query: 'remember', scope: 'global' });
    expect([...h.fs.files].filter(([p]) => !p.includes('/activity/')).every(([p, c]) => files.get(p) === c)).toBe(true);
    const records = h.activityRecords().filter((x) => x['action'] === 'recalled');
    expect(records.map((x) => [x['entity_id'], 'repo_key' in x])).toEqual(expect.arrayContaining([[m['id'], false], [r['id'], true]]));
    expect(records).toHaveLength(3);
    expect(JSON.stringify(records)).not.toContain('remember me too");');
    const view = await h.view();
    expect(view.activity.usage.get(String(m['id']))).toMatchObject({ count: 2 });
    expect(view.activity.usage.get(String(r['id']))).toMatchObject({ count: 1 });
  });

  it('[WL-38] long content is cut in recall results and read whole with memory_get', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const m = await save(h, { kind: 'runbook', title: 'long steps', purpose: 'run', content: 'x'.repeat(9_000) });
    const [hit] = (await h.obj('memory_recall', { query: 'steps' }))['results'] as Record<string, unknown>[];
    expect(hit).toMatchObject({ truncated: true });
    expect(String(hit?.['content'])).toHaveLength(8_001);
    expect(String((await h.obj('memory_get', { id: m['id'] }))['content'])).toHaveLength(9_000);
  });
});

describe.each(['lazy', 'live'] as const)('memory lifecycle (%s index)', (mode) => {
  it('[WL-17] mark_stale and archive change a memory only when called, with the allowed transitions', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const m = await save(h, { kind: 'fact', title: 'maybe outdated' });
    const stale = await h.obj('memory_mark_stale', { id: m['id'], reason: 'moved to pnpm' });
    expect(stale['message']).toBe(`Memory ${String(m['id'])} marked stale.`);
    expect(stale['memory']).toMatchObject({ status: 'stale', status_reason: 'moved to pnpm' });
    expect((await h.obj('memory_mark_stale', { id: m['id'] }))['message']).toBe(`Memory ${String(m['id'])} is already stale.`);
    expect((await h.obj('memory_archive', { id: m['id'] }))['memory']).toMatchObject({ status: 'archived' });
    expect((await h.obj('memory_archive', { id: m['id'] }))['message']).toContain('already archived');
    expect(isWarlogError(await failure(h.call('memory_mark_stale', { id: m['id'] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_archive', { id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
    expect(h.activityRecords().filter((r) => r['action'] === 'status_changed').map((r) => r['new_value'])).toEqual(['stale', 'archived']);
  });

  it('[WL-17] supersede links both memories and removes the old one from recall', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const oldM = await save(h, { kind: 'decision', title: 'use npm' });
    const newM = await save(h, { kind: 'decision', title: 'use pnpm' });
    const result = await h.obj('memory_supersede', { id: oldM['id'], superseded_by: newM['id'], reason: 'workspace support' });
    expect(result['superseded']).toMatchObject({ status: 'superseded', superseded_by: newM['id'], status_reason: 'workspace support' });
    expect(result['replacement']).toMatchObject({ links: [{ rel: 'supersedes', target: oldM['id'] }] });
    expect(await recalled(h, { query: 'use' })).toEqual(['use pnpm']);
    expect(isWarlogError(await failure(h.call('memory_supersede', { id: oldM['id'], superseded_by: newM['id'] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_supersede', { id: newM['id'], superseded_by: newM['id'] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('memory_supersede', { id: newM['id'], superseded_by: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
    const third = await save(h, { kind: 'decision', title: 'use bun' });
    await h.call('memory_supersede', { id: newM['id'], superseded_by: third['id'] });
    expect((await h.obj('memory_get', { id: third['id'] }))['links']).toEqual([{ rel: 'supersedes', target: newM['id'] }]);
  });

  it('[WL-17] review lists unused memories, stale ones and likely duplicates and writes nothing', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const a = await save(h, { kind: 'fact', title: 'windows path separators in git output' });
    const b = await save(h, { kind: 'fact', title: 'windows path separators in git' });
    await save(h, { kind: 'guardrail', title: 'windows path separators in git output' });
    const used = await save(h, { kind: 'fact', title: 'frequently recalled lesson' });
    const stale = await save(h, { kind: 'decision', title: 'unrelated old decision' });
    await h.call('memory_mark_stale', { id: stale['id'] });
    h.clock.advance(100 * 86_400_000);
    await h.call('memory_recall', { query: 'frequently' });
    const files = new Map(h.fs.files);
    const review = await h.obj('memory_review', {});
    expect(Object.fromEntries(Object.entries(review).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]))).toEqual({ unused_days: 90, unused: 4, stale: 1, likely_duplicates: 1 });
    expect((review['unused'] as Record<string, unknown>[]).map((m) => m['id'])).not.toContain(used['id']);
    expect(review['likely_duplicates']).toEqual([{ overlap: 0.83, memories: [expect.objectContaining({ id: a['id'] }), expect.objectContaining({ id: b['id'] })] }]);
    expect(new Map(h.fs.files)).toEqual(files);
    expect(isWarlogError(await failure(h.call('memory_review', { unused_days: 120 })), 'VALIDATION')).toBe(true);
    expect((await h.obj('memory_review', { unused_days: 1, scope: 'global' }))['unused']).toEqual([]);
  });
});
