import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../src/core/adapters/node-file-system.ts';
import { PathGuard } from '../../../src/core/security/path-guard.ts';
import { EntityFileRepository, MAX_ENTITY_BYTES } from '../../../src/core/storage/entity-file-repository.ts';
import { EntityPaths } from '../../../src/core/storage/entity-paths.ts';
import { FixedClock, FixedMachineId } from '../../support/fakes/simple-fakes.ts';

const TASK = { type: 'task' as const, id: '01J00000000000000000000002', scope: 'repo' as const, projectId: '01J00000000000000000000001' };
let root = '';

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * A repository over the real file system.
 * @returns The repository and the entity file path.
 */
async function realRepository(): Promise<{ repo: EntityFileRepository; path: string }> {
  root = mkdtempSync(join(tmpdir(), 'warlog-limits-'));
  const fs = new NodeFileSystem();
  const paths = new EntityPaths({ global: root, repository: { root, key: 'k', mode: 'in-repo', mainWorktree: root }, warnings: [] }, new PathGuard(fs));
  return { repo: new EntityFileRepository({ fs, paths, clock: new FixedClock(), machine: new FixedMachineId() }), path: await paths.pathFor(TASK) };
}

describe('entity files on the real file system', () => {
  it('[WL-41] reports NOT_FOUND for a missing entity, as the in-memory fake does', async () => {
    const { repo } = await realRepository();
    await expect(repo.read(TASK)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(repo.update(TASK, { patch: { title: 'x' } }, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('[WL-41] refuses to write an entity above 2 MiB and to read one that grew above it', async () => {
    const { repo, path } = await realRepository();
    await expect(repo.create(TASK, { title: 'a' }, 'x'.repeat(MAX_ENTITY_BYTES + 1))).rejects.toMatchObject({ code: 'VALIDATION', details: { reason: 'too_large' } });
    await repo.create(TASK, { title: 'a' });
    writeFileSync(path, 'x'.repeat(MAX_ENTITY_BYTES + 1));
    await expect(repo.read(TASK)).rejects.toMatchObject({ code: 'INVALID_FILE', details: { reason: 'too_large' } });
  });
});
