import { describe, expect, it } from '@jest/globals';
import type { OperationContext } from '../../../../src/core/mediator/operation-context.ts';
import { entityStoreFactory } from '../../../../src/core/storage/entity-store.ts';
import { PathGuard } from '../../../../src/core/security/path-guard.ts';
import { TrackerWriter } from '../../../../src/domain/shared/tracker-writer.ts';
import { FixedClock, FixedMachineId, SequentialIds } from '../../../support/fakes/simple-fakes.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { GLOBAL_ROOT, REPO_ROOT } from '../../../support/store-fixture.ts';

const PROJECT = '01J00000000000000000000001';

/**
 * A writer over a memory store whose view cannot be refreshed.
 * @returns The writer, its context and the file system.
 */
function brokenRefreshWriter(): { writer: TrackerWriter; context: OperationContext; fs: MemoryFileSystem } {
  const fs = new MemoryFileSystem();
  const roots = { global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo' as const, mainWorktree: REPO_ROOT }, warnings: [] };
  const context = {
    roots,
    clock: new FixedClock(),
    ids: new SequentialIds(),
    machine: new FixedMachineId(),
    activity: [],
    warnings: [],
    index: {
      refresh: async (): Promise<void> => {
        throw new Error('view unavailable');
      },
    },
  } as unknown as OperationContext;
  const stores = entityStoreFactory(fs, new PathGuard(fs));
  return { writer: new TrackerWriter(stores(context), context), context, fs };
}

describe('TrackerWriter when the view cannot be refreshed after a write', () => {
  it('[WL-04] [WL-41] the write already happened, so its activity is queued and the caller is told through a warning, not an error that invites a retry', async () => {
    const { writer, context, fs } = brokenRefreshWriter();
    const record = await writer.create({ type: 'project', id: PROJECT, scope: 'repo', projectId: PROJECT }, { name: 'p' }, '', "Project 'p' created");
    expect(record.data['rev']).toBe(1);
    expect([...fs.files.keys()].some((k) => k.endsWith(`${PROJECT}/project.md`))).toBe(true);
    expect(context.activity).toHaveLength(1);
    expect(context.warnings).toContain('index.refresh_failed');
  });
});
