import { describe, expect, it } from '@jest/globals';
import { join, resolve } from 'node:path';
import { RepoLocator } from '../../../../src/core/git/repo-locator.ts';
import { FakeGitClient } from '../../../support/fakes/fake-git-client.ts';

const MAIN = resolve('/src/warlog');

describe('RepoLocator', () => {
  it('[WL-71] resolves any worktree to the main working tree', async () => {
    const git = new FakeGitClient({ commonDir: join(MAIN, '.git'), remotes: { origin: 'git@github.com:scrapup/warlog.git' } });
    expect(await new RepoLocator(git).locate(resolve('/tmp/worktree-a'))).toEqual({
      mainWorktree: MAIN,
      key: 'github.com__scrapup__warlog',
      hasRemote: true,
    });
  });

  it('[WL-02] prefers origin and falls back to the first remote', async () => {
    const both = new FakeGitClient({ commonDir: join(MAIN, '.git'), remotes: { upstream: 'https://a/x/y', origin: 'https://b/x/y' } });
    expect((await new RepoLocator(both).locate(MAIN))?.key).toBe('b__x__y');
    const other = new FakeGitClient({ commonDir: join(MAIN, '.git'), remotes: { upstream: 'https://a/x/y' } });
    expect((await new RepoLocator(other).locate(MAIN))?.key).toBe('a__x__y');
  });

  it('[WL-03] keys a repository without remote by its directory name', async () => {
    const git = new FakeGitClient({ commonDir: join(MAIN, '.git') });
    expect(await new RepoLocator(git).locate(MAIN)).toEqual({ mainWorktree: MAIN, key: 'local__warlog', hasRemote: false });
  });

  it('[WL-03] returns undefined outside a repository', async () => {
    expect(await new RepoLocator(new FakeGitClient()).locate(MAIN)).toBeUndefined();
  });

  it('treats the common dir of a bare repository as its root', async () => {
    const git = new FakeGitClient({ commonDir: resolve('/srv/x.git') });
    expect((await new RepoLocator(git).locate(resolve('/srv/x.git')))?.mainWorktree).toBe(resolve('/srv/x.git'));
  });
});
