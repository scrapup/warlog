import { describe, expect, it } from '@jest/globals';
import { StoreContextFactory } from '../../../../src/core/mediator/store-context-factory.ts';
import type { StoreRoots } from '../../../../src/core/storage/store-roots.ts';
import { FakeGitClient } from '../../../support/fakes/fake-git-client.ts';
import { FixedClock, FixedMachineId, MemoryEnv, SequentialIds } from '../../../support/fakes/simple-fakes.ts';

/**
 * Builds a factory over fixed roots.
 * @param vars - Environment variables.
 * @returns The factory and the directories it resolved.
 */
function setup(vars: Record<string, string> = {}) {
  const resolved: string[] = [];
  const roots: StoreRoots = { global: '/home/u/.warlog', warnings: ['git.unavailable'] };
  const factory = new StoreContextFactory({
    resolver: {
      resolve: async (cwd) => {
        resolved.push(cwd);
        return roots;
      },
    },
    env: new MemoryEnv(vars, '/home/u', '/work/repo'),
    git: new FakeGitClient({ branch: 'feature' }),
    clock: new FixedClock(),
    ids: new SequentialIds(),
    machine: new FixedMachineId(),
  });
  return { factory, resolved };
}

describe('store context factory', () => {
  it('resolves the roots of the working directory on every call and copies their warnings', async () => {
    const { factory, resolved } = setup();
    const first = await factory.create();
    const second = await factory.create();
    expect(resolved).toEqual(['/work/repo', '/work/repo']);
    expect(first.warnings).toEqual(['git.unavailable']);
    first.warnings.push('x');
    expect(second.warnings).toEqual(['git.unavailable']);
    expect(first.activity).not.toBe(second.activity);
    expect(first.defaultProject).toBeUndefined();
  });

  it('reads the default project and resolves the current branch lazily', async () => {
    const context = await setup({ WARLOG_PROJECT: 'warlog' }).factory.create();
    expect(context.defaultProject).toBe('warlog');
    expect(await context.currentBranch()).toBe('feature');
    expect((await setup({ WARLOG_PROJECT: ' ' }).factory.create()).defaultProject).toBeUndefined();
  });
});
