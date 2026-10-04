import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitCliClient, assertReadOnlyGit } from '../../../../src/core/git/git-cli-client.ts';

let repo = '';
let outside = '';

beforeAll(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'warlog-git-')));
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'warlog-nogit-')));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:scrapup/warlog.git'], { cwd: repo });
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('assertReadOnlyGit', () => {
  it.each([[['rev-parse', '--show-toplevel']], [['remote']], [['remote', 'get-url', 'origin']], [['--version']]])(
    '[WL-72] allows %p',
    (args) => {
      expect(() => assertReadOnlyGit(args)).not.toThrow();
    },
  );

  it.each([
    [['add', '.']],
    [['commit', '-m', 'x']],
    [['push']],
    [['remote', 'add', 'x', 'y']],
    [['remote', 'set-url', 'origin', 'y']],
    [['config', 'core.excludesFile', 'x']],
    [['update-index', '--assume-unchanged']],
    [[]],
  ])('[WL-72] rejects %p', (args) => {
    expect(() => assertReadOnlyGit(args)).toThrow(expect.objectContaining({ code: 'INTERNAL' }));
  });
});

describe('GitCliClient', () => {
  it('[WL-72] exposes read operations only', () => {
    const methods = Object.getOwnPropertyNames(GitCliClient.prototype).filter((m) => m !== 'constructor' && m !== 'run');
    expect(methods.sort()).toEqual(['commonDir', 'currentBranch', 'isAvailable', 'remoteUrl', 'remotes', 'topLevel']);
  });

  it('reads repository facts', async () => {
    const git = new GitCliClient();
    expect(await git.commonDir(repo)).toBe(join(repo, '.git'));
    expect(realpathSync(String(await git.topLevel(repo)))).toBe(repo);
    expect(await git.remotes(repo)).toEqual(['origin']);
    expect(await git.remoteUrl(repo, 'origin')).toBe('git@github.com:scrapup/warlog.git');
    expect(await git.remoteUrl(repo, 'missing')).toBeUndefined();
    expect(await git.isAvailable(repo)).toBe(true);
  });

  it('returns undefined and empty lists outside a repository', async () => {
    const git = new GitCliClient();
    expect(await git.commonDir(outside)).toBeUndefined();
    expect(await git.currentBranch(outside)).toBeUndefined();
    expect(await git.remotes(outside)).toEqual([]);
  });
});
