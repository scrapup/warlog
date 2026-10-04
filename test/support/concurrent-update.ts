/**
 * Child process used by the concurrency integration test: updates one task with an expected
 * rev and prints `ok` or the error code. Usage: `node concurrent-update.ts <root> <value>`.
 */
import { NodeFileSystem } from '../../src/core/adapters/node-file-system.ts';
import { WarlogError } from '../../src/core/errors/warlog-error.ts';
import { PathGuard } from '../../src/core/security/path-guard.ts';
import { EntityFileRepository } from '../../src/core/storage/entity-file-repository.ts';
import { EntityPaths } from '../../src/core/storage/entity-paths.ts';
import { FixedClock, FixedMachineId } from './fakes/simple-fakes.ts';

const [root = '', value = ''] = process.argv.slice(2);
const fs = new NodeFileSystem();
const paths = new EntityPaths({ global: root, repository: { root, key: 'k', mode: 'in-repo', mainWorktree: root }, warnings: [] }, new PathGuard(fs));
const repo = new EntityFileRepository({ fs, paths, clock: new FixedClock(), machine: new FixedMachineId(`m-${value}`) });
const ref = { type: 'task', id: '01J00000000000000000000002', scope: 'repo', projectId: '01J00000000000000000000001' } as const;
try {
  await repo.update(ref, { patch: { title: value } }, 1);
  process.stdout.write('ok');
} catch (error: unknown) {
  process.stdout.write(error instanceof WarlogError ? `${error.code}:${String(error.details?.['reason'])}` : String(error));
}
