import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../src/core/adapters/node-file-system.ts';
import { GitCliClient } from '../../../src/core/git/git-cli-client.ts';
import { RepoLocator } from '../../../src/core/git/repo-locator.ts';
import { PathGuard } from '../../../src/core/security/path-guard.ts';
import { StoreRootsResolver } from '../../../src/core/storage/store-roots.ts';
import { MemoryEnv } from '../../support/fakes/simple-fakes.ts';

let base = '';
let main = '';
let worktree = '';

/**
 * Runs git in a directory.
 * @param cwd - Directory.
 * @param args - Arguments.
 * @returns Nothing.
 */
function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'ignore' });
}

/**
 * Hashes a file (or returns a marker when absent).
 * @param path - File path.
 * @returns Hash or `absent`.
 */
function hash(path: string): string {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'absent';
}

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'warlog-repo-')));
  main = join(base, 'main');
  worktree = join(base, 'wt');
  execFileSync('git', ['init', '-q', '-b', 'main', main]);
  git(main, 'remote', 'add', 'origin', 'https://github.com/scrapup/warlog.git');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(main, 'worktree', 'add', '-q', worktree);
}, 60_000);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

/**
 * Builds a resolver over the real file system and git, with an isolated global root (never the
 * developer's ~/.warlog).
 * @returns The resolver.
 */
function resolver(): StoreRootsResolver {
  const fs = new NodeFileSystem();
  const git = new GitCliClient();
  const env = new MemoryEnv({ WARLOG_DIR: join(base, 'global') }, base, base);
  return new StoreRootsResolver({ fs, env, git, guard: new PathGuard(fs), locator: new RepoLocator(git) });
}

describe('store roots with real git', () => {
  it('[WL-71] every worktree resolves to the main working tree .warlog', async () => {
    const fromMain = await resolver().resolve(main);
    const fromWorktree = await resolver().resolve(worktree);
    expect(fromMain.repository?.root).toBe(join(main, '.warlog'));
    expect(fromWorktree.repository).toEqual(fromMain.repository);
    expect(fromWorktree.repository?.key).toBe('github.com__scrapup__warlog');
  }, 30_000);

  it('[WL-72] never creates or modifies ignore files', async () => {
    const before = [hash(join(main, '.gitignore')), hash(join(main, '.git', 'info', 'exclude'))];
    await resolver().resolve(worktree);
    await resolver().resolve(main);
    expect([hash(join(main, '.gitignore')), hash(join(main, '.git', 'info', 'exclude'))]).toEqual(before);
    expect(existsSync(join(main, '.gitignore'))).toBe(false);
  }, 30_000);

  it('[WL-03] a directory outside any repository has no repository scope', async () => {
    expect((await resolver().resolve(base)).repository).toBeUndefined();
  }, 30_000);
});
