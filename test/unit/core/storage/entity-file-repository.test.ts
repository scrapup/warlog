import { describe, expect, it } from '@jest/globals';
import type { EntityRef } from '../../../../src/core/storage/entity-ref.ts';
import { memoryStore } from '../../../support/store-fixture.ts';

const P = '01J00000000000000000000001';
const TASK: EntityRef = { type: 'task', id: '01J00000000000000000000002', scope: 'repo', projectId: P };

describe('EntityFileRepository', () => {
  it('[WL-04] creates one Markdown file with managed common fields and rev 1', async () => {
    const store = memoryStore();
    const created = await store.repo.create(TASK, { title: 'Write tests', status: 'todo', rev: 99, id: 'spoof' }, 'Body');
    expect(created).toEqual({
      data: {
        id: TASK.id,
        type: 'task',
        rev: 1,
        created_at: '2026-10-03T12:00:00.000Z',
        updated_at: '2026-10-03T12:00:00.000Z',
        machine: 'test-host-abc123',
        status: 'todo',
        title: 'Write tests',
      },
      body: 'Body',
    });
    expect(await store.repo.read(TASK)).toEqual(created);
  });

  it('[WL-42] rejects creating an existing entity', async () => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a' });
    await expect(store.repo.create(TASK, { title: 'b' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('[WL-42] updates with the current rev and rejects a stale rev with the current state', async () => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a', status: 'todo' }, 'v1');
    const updated = await store.repo.update(TASK, { patch: { status: 'done', id: 'ignored' } }, 1);
    expect(updated.data).toMatchObject({ id: TASK.id, rev: 2, status: 'done', title: 'a' });
    expect(updated.body).toBe('v1');
    await expect(store.repo.update(TASK, { patch: { status: 'todo' }, body: 'lost' }, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'stale_rev', current: expect.objectContaining({ rev: 2, status: 'done' }) },
    });
    expect((await store.repo.update(TASK, { patch: {}, body: 'v3' }, 2)).body).toBe('v3');
  });

  it('[WL-46] detects conflicts by rev only, regardless of clock skew', async () => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a' });
    store.clock.advance(-86_400_000);
    const back = await store.repo.update(TASK, { patch: { title: 'b' } }, 1);
    expect(back.data['updated_at']).toBe('2026-10-02T12:00:00.000Z');
    store.clock.advance(10 * 86_400_000);
    await expect(store.repo.update(TASK, { patch: { title: 'c' } }, 1)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('[WL-08] soft-deletes and restores, refusing double operations', async () => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a' });
    const deleted = await store.repo.softDelete(TASK, 1, { by: 'agent', reason: 'duplicate' });
    expect(deleted.data).toMatchObject({ rev: 2, deleted_at: '2026-10-03T12:00:00.000Z', deleted_by: 'agent', delete_reason: 'duplicate' });
    await expect(store.repo.softDelete(TASK, 2, { by: 'agent', reason: 'again' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const restored = await store.repo.restore(TASK, 2);
    expect(restored.data).not.toHaveProperty('deleted_at');
    expect(restored.data['rev']).toBe(3);
    await expect(store.repo.restore(TASK, 3)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('[WL-08] ignores deletion fields in a plain update (only delete and restore set them)', async () => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a', deleted_at: 'x' });
    const updated = await store.repo.update(TASK, { patch: { deleted_at: 'now', deleted_by: 'me', title: 'b' } }, 1);
    expect(updated.data).not.toHaveProperty('deleted_at');
    expect(updated.data).not.toHaveProperty('deleted_by');
    expect(updated.data['title']).toBe('b');
  });

  it('[WL-43] rejects a body that would read back as merge-conflicted, writing nothing', async () => {
    const store = memoryStore();
    const body = '<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs\n';
    await expect(store.repo.create(TASK, { title: 'a' }, body)).rejects.toMatchObject({ code: 'VALIDATION', details: { reason: 'merge_conflict' } });
    expect(store.fs.files.size).toBe(0);
    expect(store.fs.locks.size).toBe(0);
  });

  it.each([['0'], ['1.5'], ['.nan'], ['"1"']])('[WL-42] flags an invalid rev %p as INVALID_FILE', async (rev) => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a' });
    const path = [...store.fs.files.keys()][0] ?? '';
    store.fs.files.set(path, (store.fs.files.get(path) ?? '').replace('rev: 1', `rev: ${rev}`));
    await expect(store.repo.read(TASK)).rejects.toMatchObject({ code: 'INVALID_FILE' });
  });

  it('a failing lock release never masks a successful write', async () => {
    const store = memoryStore();
    const lock = store.fs.lock.bind(store.fs);
    store.fs.lock = async (p) => {
      await lock(p);
      return async () => Promise.reject(new Error('EPERM'));
    };
    await expect(store.repo.create(TASK, { title: 'a' })).resolves.toMatchObject({ data: { rev: 1 } });
  });

  it('[WL-41] leaves the stored entity intact when the write fails', async () => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a' });
    store.fs.failWrites.add([...store.fs.files.keys()][0] ?? '');
    await expect(store.repo.update(TASK, { patch: { title: 'b' } }, 1)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect((await store.repo.read(TASK)).data).toMatchObject({ rev: 1, title: 'a' });
    expect(store.fs.locks.size).toBe(0);
  });

  it('[WL-43] flags a file whose id or type does not match its location', async () => {
    const store = memoryStore();
    await store.repo.create(TASK, { title: 'a' });
    const path = [...store.fs.files.keys()][0] ?? '';
    store.fs.files.set(path, (store.fs.files.get(path) ?? '').replace(TASK.id, '01J0000000000000000000000Z'));
    await expect(store.repo.read(TASK)).rejects.toMatchObject({ code: 'INVALID_FILE' });
  });

  it('reports NOT_FOUND for a missing entity', async () => {
    await expect(memoryStore().repo.read(TASK)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
