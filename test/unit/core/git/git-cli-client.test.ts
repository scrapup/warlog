import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGitBinary } from '../../../../src/core/git/git-binary.ts';
import { GitCliClient, assertReadOnlyGit, isExpectedGitFailure } from '../../../../src/core/git/git-cli-client.ts';
import { RecordingLogger } from '../../../support/fakes/simple-fakes.ts';

let repo = '';
let outside = '';

beforeAll(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'warlog-git-')));
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'warlog-nogit-')));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:scrapup/warlog.git'], { cwd: repo });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
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
    expect(await git.currentBranch(repo)).toBe('main');
    expect(await git.isAvailable(repo)).toBe(true);
  });

  it('reports a missing git binary as unavailable', async () => {
    const git = new GitCliClient({ binary: 'warlog-no-such-git-binary' });
    expect(await git.isAvailable(outside)).toBe(false);
    expect(await git.commonDir(outside)).toBeUndefined();
  });

  it('returns undefined and empty lists outside a repository, logging codes only', async () => {
    const logger = new RecordingLogger();
    const git = new GitCliClient({ logger });
    expect(await git.commonDir(outside)).toBeUndefined();
    expect(await git.currentBranch(outside)).toBeUndefined();
    expect(await git.remotes(outside)).toEqual([]);
    expect(logger.events.every((e) => e.event === 'git.command_failed' && !JSON.stringify(e.fields).includes(outside))).toBe(true);
  });
});

describe('isExpectedGitFailure', () => {
  it.each([
    [{ code: 128 }, true],
    [{ code: 'ENOENT' }, true],
    [{ code: 128, killed: true }, false],
    [{ code: 'ETIMEDOUT' }, false],
    [{ signal: 'SIGTERM' }, false],
  ])('%o → %p', (error, expected) => {
    expect(isExpectedGitFailure(Object.assign(new Error('x'), error) as ExecFileException)).toBe(expected);
  });
});

describe('resolveGitBinary', () => {
  it('uses plain git outside Windows', () => {
    expect(resolveGitBinary('darwin', '/usr/bin', () => true)).toBe('git');
  });

  it('resolves an absolute git.exe from PATH on Windows, skipping relative and empty entries', () => {
    const seen: string[] = [];
    const found = resolveGitBinary('win32', ';.;C:\\Tools;C:\\Git\\cmd', (p) => {
      seen.push(p);
      return p.includes('Git');
    });
    expect(found).toContain('git.exe');
    expect(found).toContain('Git');
    expect(seen.every((p) => !p.startsWith('.'))).toBe(true);
  });

  it('falls back to plain git on Windows when nothing is found', () => {
    expect(resolveGitBinary('win32', undefined, () => false)).toBe('git');
  });
});
