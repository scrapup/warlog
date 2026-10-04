import { describe, expect, it } from '@jest/globals';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { LiveIndexSource } from '../../../../src/core/index/index-source.ts';
import { StoreIndex } from '../../../../src/core/index/store-index.ts';
import { StoreContextFactory } from '../../../../src/core/mediator/store-context-factory.ts';
import type { StoreRoots } from '../../../../src/core/storage/store-roots.ts';
import { FakeGitClient } from '../../../support/fakes/fake-git-client.ts';
import { FixedClock, FixedMachineId, MemoryEnv, SequentialIds } from '../../../support/fakes/simple-fakes.ts';

/** Git fake recording the directory of each branch lookup. */
class RecordingGit extends FakeGitClient {
  /** Directories asked for their branch. */
  readonly branchCalls: string[] = [];

  /**
   * Records the call.
   * @param cwd - Directory.
   * @returns The canned branch.
   */
  override async currentBranch(cwd?: string): Promise<string | undefined> {
    this.branchCalls.push(cwd ?? '');
    return super.currentBranch();
  }
}

/**
 * Builds a factory over fixed roots.
 * @param vars - Environment variables.
 * @returns The factory and the directories it resolved.
 */
function setup(vars: Record<string, string> = {}) {
  const resolved: string[] = [];
  const git = new RecordingGit({ branch: 'feature' });
  const roots: StoreRoots = { global: '/home/u/.warlog', warnings: ['git.unavailable'] };
  const factory = new StoreContextFactory({
    resolver: {
      resolve: async (cwd) => {
        resolved.push(cwd);
        return roots;
      },
    },
    env: new MemoryEnv(vars, '/home/u', '/work/repo'),
    git,
    clock: new FixedClock(),
    ids: new SequentialIds(),
    machine: new FixedMachineId(),
    indexes: (_roots, request) => {
      requests.push(request);
      return new LiveIndexSource(new StoreIndex());
    },
  });
  return { factory, resolved, git };
}

const REQUEST = { operation: 'op', load: 'point' as const };
const requests: unknown[] = [];

describe('store context factory', () => {
  it('resolves the roots of the working directory on every call and copies their warnings', async () => {
    const { factory, resolved } = setup();
    const first = await factory.create(REQUEST);
    const second = await factory.create(REQUEST);
    expect(resolved).toEqual(['/work/repo', '/work/repo']);
    expect(first.warnings).toEqual(['git.unavailable']);
    first.warnings.push('x');
    expect(second.warnings).toEqual(['git.unavailable']);
    expect(first.activity).not.toBe(second.activity);
    expect(first.defaultProject).toBeUndefined();
    expect(requests.at(-1)).toEqual(REQUEST);
  });

  it('propagates a failure to resolve the roots', async () => {
    const factory = new StoreContextFactory({
      resolver: {
        resolve: async () => {
          throw new WarlogError('VALIDATION', 'WARLOG_DIR must be an absolute path');
        },
      },
      env: new MemoryEnv(),
      git: new FakeGitClient(),
      clock: new FixedClock(),
      ids: new SequentialIds(),
      machine: new FixedMachineId(),
      indexes: () => new LiveIndexSource(new StoreIndex()),
    });
    await expect(factory.create(REQUEST)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('reads the default project and resolves the current branch lazily', async () => {
    const { factory, git } = setup({ WARLOG_PROJECT: 'warlog' });
    const context = await factory.create(REQUEST);
    expect(context.defaultProject).toBe('warlog');
    expect(await context.currentBranch()).toBe('feature');
    expect(git.branchCalls).toEqual(['/work/repo']);
    expect((await setup({ WARLOG_PROJECT: ' ' }).factory.create(REQUEST)).defaultProject).toBeUndefined();
  });
});
