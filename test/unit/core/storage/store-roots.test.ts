import { describe, expect, it } from '@jest/globals';
import { join, resolve } from 'node:path';
import { RepoLocator } from '../../../../src/core/git/repo-locator.ts';
import { PathGuard } from '../../../../src/core/security/path-guard.ts';
import { StoreRootsResolver } from '../../../../src/core/storage/store-roots.ts';
import { FakeGitClient } from '../../../support/fakes/fake-git-client.ts';
import type { FakeGitState } from '../../../support/fakes/fake-git-client.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { MemoryEnv } from '../../../support/fakes/simple-fakes.ts';

const HOME = resolve('/home/u');
const MAIN = resolve('/src/warlog');
const KEY = 'github.com__scrapup__warlog';
const REPO: FakeGitState = { commonDir: join(MAIN, '.git'), remotes: { origin: 'git@github.com:scrapup/warlog.git' } };

/**
 * Builds a resolver over fakes.
 * @param git - Git state.
 * @param files - Store files.
 * @param vars - Environment variables.
 * @returns The resolver and its file system.
 */
function setup(git: FakeGitState, files: Record<string, string> = {}, vars: Record<string, string> = {}) {
  const fs = new MemoryFileSystem(files);
  const fakeGit = new FakeGitClient(git);
  const resolver = new StoreRootsResolver({ fs, env: new MemoryEnv(vars, HOME), git: fakeGit, guard: new PathGuard(fs), locator: new RepoLocator(fakeGit) });
  return { resolver, fs };
}

/**
 * Path of the storage-mode variable.
 * @param global - Global root.
 * @param key - Repository key.
 * @returns File path.
 */
function modeFile(global: string, key: string): string {
  return join(global, 'repos', key, 'vars', 'warlog.storage.yaml');
}

describe('StoreRootsResolver', () => {
  it('[WL-01] defaults the global root to ~/.warlog and the repository root to <main>/.warlog', async () => {
    const roots = await setup(REPO).resolver.resolve(MAIN);
    expect(roots).toEqual({
      global: join(HOME, '.warlog'),
      repository: { root: join(MAIN, '.warlog'), key: KEY, mode: 'in-repo', mainWorktree: MAIN },
      warnings: [],
    });
  });

  it('[WL-01] honors WARLOG_DIR', async () => {
    expect((await setup(REPO, {}, { WARLOG_DIR: resolve('/sync/warlog') }).resolver.resolve(MAIN)).global).toBe(resolve('/sync/warlog'));
  });

  it('[WL-70] switches to the global root when warlog.storage is global', async () => {
    const global = join(HOME, '.warlog');
    const roots = await setup(REPO, { [modeFile(global, KEY)]: 'name: warlog.storage\ntype: string\nvalue: global\n' }).resolver.resolve(MAIN);
    expect(roots.repository).toEqual({ root: join(global, 'repos', KEY), key: KEY, mode: 'global', mainWorktree: MAIN });
    expect(roots.warnings).toEqual([]);
  });

  it.each([
    ['an unknown value', 'value: cloud\n'],
    ['a non-mapping document', '- global\n'],
  ])('[WL-70] rejects %s in warlog.storage as INVALID_FILE', async (_label, text) => {
    const files = { [modeFile(join(HOME, '.warlog'), KEY)]: text };
    await expect(setup(REPO, files).resolver.resolve(MAIN)).rejects.toMatchObject({ code: 'INVALID_FILE' });
  });

  it('[WL-01] rejects a relative WARLOG_DIR', async () => {
    await expect(setup(REPO, {}, { WARLOG_DIR: 'relative/dir' }).resolver.resolve(MAIN)).rejects.toMatchObject({
      code: 'VALIDATION',
      details: { field: 'WARLOG_DIR' },
    });
  });

  it('[WL-49] rejects an in-repository .warlog link leaving the working tree', async () => {
    const { resolver, fs } = setup(REPO, { [resolve('/elsewhere/x.md')]: 'x', [join(MAIN, 'README.md')]: 'r' });
    fs.links.set(join(MAIN, '.warlog').split('\\').join('/'), resolve('/elsewhere').split('\\').join('/'));
    await expect(resolver.resolve(MAIN)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('[WL-03] warns that a repository without remote is not portable in global mode only', async () => {
    const git: FakeGitState = { commonDir: join(MAIN, '.git') };
    expect((await setup(git).resolver.resolve(MAIN)).warnings).toEqual([]);
    const files = { [modeFile(join(HOME, '.warlog'), 'local__warlog')]: 'value: global\n' };
    const roots = await setup(git, files).resolver.resolve(MAIN);
    expect(roots.repository?.key).toBe('local__warlog');
    expect(roots.warnings).toEqual(['repo.local_scope']);
  });

  it('[WL-03] gives no repository scope outside a repository and flags a missing git', async () => {
    expect(await setup({}).resolver.resolve(MAIN)).toEqual({ global: join(HOME, '.warlog'), warnings: [] });
    expect((await setup({ available: false }).resolver.resolve(MAIN)).warnings).toEqual(['git.unavailable']);
  });

  it('[WL-03] keeps git missing and outside-repository answers apart', async () => {
    expect((await setup({ available: true }).resolver.resolve(MAIN)).warnings).toEqual([]);
  });

  it('[WL-49] rejects an unsafe repository key', async () => {
    await expect(setup({ commonDir: join(MAIN, '.git'), remotes: { origin: 'https://.evil/x' } }).resolver.resolve(MAIN)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('propagates read errors other than NOT_FOUND', async () => {
    const { resolver, fs } = setup(REPO);
    fs.readFile = async () => Promise.reject(new Error('EACCES'));
    await expect(resolver.resolve(MAIN)).rejects.toThrow('EACCES');
  });
});
