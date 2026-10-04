import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { ACTIVITY_NOT_RECORDED } from '../../../../src/core/storage/activity-log.ts';
import { REPO_ROOT, memoryStore } from '../../../support/store-fixture.ts';

const INPUT = { action: 'created', entity_type: 'task', entity_id: '01J00000000000000000000002', summary: 'Task created' } as const;

describe('ActivityLog', () => {
  it('[WL-04][WL-18] appends JSON lines to <root>/activity/<machine>/<day>.jsonl', async () => {
    const store = memoryStore();
    expect(await store.activity.append(REPO_ROOT, { ...INPUT, project_id: 'P', extra: { outcome: 'ok' } })).toBeUndefined();
    await store.activity.append(REPO_ROOT, { ...INPUT, action: 'updated', forced: true });
    const lines = (store.fs.files.get(join(REPO_ROOT, 'activity', 'test-host-abc123', '2026-10-03.jsonl').split('\\').join('/')) ?? '')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toEqual([
      { ts: '2026-10-03T12:00:00.000Z', machine: 'test-host-abc123', ...INPUT, project_id: 'P', outcome: 'ok' },
      { ts: '2026-10-03T12:00:00.000Z', machine: 'test-host-abc123', ...INPUT, action: 'updated', forced: true },
    ]);
  });

  it('[WL-04] two machines never write the same file', async () => {
    const a = memoryStore({ machine: 'laptop-aaaaaa' });
    const b = memoryStore({ machine: 'desktop-bbbbbb' });
    await a.activity.append(REPO_ROOT, INPUT);
    await b.activity.append(REPO_ROOT, INPUT);
    expect([...a.fs.files.keys()][0]).toContain('/activity/laptop-aaaaaa/');
    expect([...b.fs.files.keys()][0]).toContain('/activity/desktop-bbbbbb/');
  });

  it('reports a failed append as a warning without throwing', async () => {
    const store = memoryStore();
    store.fs.appendFile = async () => Promise.reject(new Error('EIO'));
    expect(await store.activity.append(REPO_ROOT, INPUT)).toBe(ACTIVITY_NOT_RECORDED);
    expect(store.logger.events).toEqual([
      { level: 'warn', event: 'activity.append_failed', fields: { action: 'created', entity_type: 'task', error: 'Error: EIO' } },
    ]);
  });
});
