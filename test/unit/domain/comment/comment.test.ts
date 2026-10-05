import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

describe.each(['lazy', 'live'] as const)('comment operations (%s index)', (mode) => {
  it('[WL-10] comments are appended per task file, listed oldest first and shown by task_get', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    const c1 = await h.obj('comment_add', { task_id: t['id'], content: 'first', author: 'ana' });
    expect(c1).toMatchObject({ task_id: t['id'], project_id: projectId, author: 'ana', content: 'first', rev: 1 });
    expect([...h.fs.files.keys()].some((p) => p.endsWith(join('comments', String(t['id']), `${String(c1['id'])}.md`)))).toBe(true);
    h.clock.advance(1000);
    await h.call('comment_add', { task_id: t['id'], content: 'second' });
    expect((await h.rows('comment_list', { task_id: t['id'] })).map((c) => c['content'])).toEqual(['first', 'second']);
    expect(((await h.obj('task_get', { id: t['id'] }))['comments'] as Record<string, unknown>[]).length).toBe(2);
    expect(h.activityRecords().at(-2)).toMatchObject({ entity_type: 'comment', summary: "Comment added to task 'T' by ana" });
    expect(isWarlogError(await failure(h.call('comment_add', { task_id: '01J00000000000000000000099', content: 'x' })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('comment_list', { task_id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-08] comment_delete is soft, comment_restore brings it back, and content is never edited', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const t = await task(h, epicId, 'T');
    const c = await h.obj('comment_add', { task_id: t['id'], content: 'oops' });
    const removed = await h.obj('comment_delete', { id: c['id'], reason: 'wrong task', deleted_by: 'me' });
    expect(removed['comment']).toMatchObject({ content: 'oops', deleted_by: 'me', delete_reason: 'wrong task' });
    expect(h.activityRecords().at(-1)).toMatchObject({ action: 'deleted', summary: `Comment ${String(c['id'])} removed by me: wrong task` });
    expect((await h.obj('comment_delete', { id: c['id'] }))['message']).toBe(`Comment ${String(c['id'])} was already removed.`);
    expect(await h.rows('comment_list', { task_id: t['id'] })).toEqual([]);
    expect((await h.rows('comment_list', { task_id: t['id'], include_deleted: true })).length).toBe(1);
    expect((await h.obj('comment_restore', { id: c['id'] }))['message']).toBe(`Comment ${String(c['id'])} restored.`);
    expect((await h.obj('comment_restore', { id: c['id'] }))['message']).toBe(`Comment ${String(c['id'])} is not removed — nothing to restore.`);
    expect((await h.rows('comment_list', { task_id: t['id'] }))[0]).toMatchObject({ content: 'oops', rev: 3 });
    expect(isWarlogError(await failure(h.call('comment_delete', { id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
  });
});
