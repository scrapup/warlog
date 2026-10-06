import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gitExecutable } from '../support/git-executable.ts';
import { isolatedEnv } from '../support/isolated-env.ts';
import { packAndInstall } from '../support/packed-package.ts';
import type { InstalledPackage } from '../support/packed-package.ts';
import { runNode } from '../support/run-node.ts';

let installed: InstalledPackage | undefined;

beforeAll(() => {
  installed = packAndInstall();
}, 300_000);

afterAll(() => {
  installed?.dispose();
});

/**
 * Returns the installed bin path, failing clearly when setup did not complete.
 * @returns Absolute bin path.
 */
function bin(): string {
  if (installed === undefined) {
    throw new Error('packed package not installed (see beforeAll failure)');
  }
  return installed.bin;
}

describe('warlog command line from the packed tarball', () => {
  it.each([['--version'], ['-V']])('prints the package version for %s', (flag) => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const result = runNode([bin(), flag], { timeoutMs: 25_000 });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  }, 30_000);

  it('[WL-37] exits 1 with the root help when called without a command', () => {
    const result = runNode([bin()], { timeoutMs: 25_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: warlog');
    expect(result.stderr).toContain('mcp');
  }, 30_000);

  it('[WL-45] runs doctor on an empty store as a healthy report', () => {
    const iso = isolatedEnv();
    try {
      const result = runNode([bin(), 'doctor'], { cwd: iso.cwd, env: iso.env, timeoutMs: 25_000 });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('healthy: true');
    } finally {
      iso.dispose();
    }
  }, 30_000);

  it('[WL-37] shows the root help with exit 0', () => {
    const result = runNode([bin(), '--help'], { timeoutMs: 25_000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Start the MCP server');
  }, 30_000);

  it.each([
    [['nope'], "unknown command 'nope'"],
    [['--bogus'], "unknown option '--bogus'"],
  ])('[WL-39] exits 3 on %j with a stable validation error', (args, message) => {
    const result = runNode([bin(), ...args], { timeoutMs: 25_000 });
    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/^VALIDATION: /);
    expect(result.stderr).toContain(message);
  }, 30_000);
});

describe('warlog variables from the packed tarball', () => {
  it('[WL-25] [WL-39] var get prints the raw value of the most specific scope with exit codes 0, 2 and 3', () => {
    const iso = isolatedEnv();
    try {
      execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: iso.cwd });
      const run = (args: string[]): ReturnType<typeof runNode> => runNode([bin(), ...args], { cwd: iso.cwd, env: iso.env, timeoutMs: 25_000 });
      expect(run(['var', 'set', 'forge.parallel_executors', '--value', 'true', '--scope', 'global']).status).toBe(0);
      expect(run(['var', 'set', 'forge.parallel_executors', '--value', 'false', '--scope', 'repo']).status).toBe(0);
      const raw = run(['var', 'get', 'forge.parallel_executors']);
      expect([raw.status, raw.stdout, raw.stderr]).toEqual([0, 'false\n', '']);
      const full = run(['var', 'get', 'forge.parallel_executors', '--format', 'yaml']);
      expect(full.stdout).toContain('scope: repo');
      expect(full.stdout).toContain('type: boolean');
      expect(run(['var', 'set', 'quoted', '--value', '012', '--scope', 'global']).status).toBe(0);
      expect(run(['var', 'get', 'quoted']).stdout).toBe('012\n');
      expect(run(['var', 'get', 'quoted', '--format', 'json']).stdout).toContain('"type": "string"');
      const twice = run(['var', 'get', 'a', '--name', 'b']);
      expect(twice.status).toBe(3);
      expect(twice.stderr).toContain('given twice');
      expect(run(['var', 'get', '--name', 'quoted']).stdout).toBe('012\n');
      expect(run(['var', 'get', '--help']).stdout).toContain('Usage: warlog var get [options] [name]');
      expect(run(['var', 'set', 'cfg', '--json-input', '{"name":"cfg","scope":"repo","value":{"max":5}}']).status).toBe(0);
      expect(run(['var', 'get', 'cfg', '--path', 'max']).stdout).toBe('5\n');
      const missing = run(['var', 'get', 'absent']);
      expect(missing.status).toBe(2);
      expect(missing.stderr).toMatch(/^NOT_FOUND: /);
      const bad = run(['var', 'set', 'flag', '--value', 'yes', '--type', 'boolean', '--scope', 'global']);
      expect(bad.status).toBe(3);
      expect(bad.stderr).toContain('does not match type boolean');
      const secret = run(['var', 'set', 'token', '--value', `ghp_${'a'.repeat(36)}`, '--scope', 'global']);
      expect(secret.status).toBe(1);
      expect(secret.stderr).toContain('SECRET_REJECTED: ');
      expect(secret.stderr).not.toContain('ghp_');
    } finally {
      iso.dispose();
    }
  }, 120_000);
});

describe('warlog memory and playbook from the packed tarball', () => {
  it('[WL-18] [WL-20] records a command outcome, then prints the playbook and the patterns for a file', () => {
    const iso = isolatedEnv();
    try {
      execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: iso.cwd });
      const run = (args: string[]): ReturnType<typeof runNode> => runNode([bin(), ...args], { cwd: iso.cwd, env: iso.env, timeoutMs: 25_000 });
      const saved = run(['memory', 'save', '--kind', 'pattern', '--title', 'ports first', '--content', 'inject side effects', '--applies-to', 'src/**/*.ts', '--format', 'json']);
      expect([saved.status, saved.stderr]).toEqual([0, '']);
      const recorded = run(['command', 'record', '--cmd', 'npm run test:unit', '--outcome', 'fail', '--exit-code', '1', '--purpose', 'test', '--format', 'json']);
      expect(recorded.status).toBe(0);
      expect(JSON.parse(recorded.stdout)).toMatchObject({ created: true, status: 'fails' });
      const book = run(['playbook', 'test', '--format', 'json']);
      expect(book.status).toBe(0);
      expect(JSON.parse(book.stdout)).toMatchObject({ topic: 'test', commands: { fails: [{ cmd: 'npm run test:unit', status: 'fails' }] } });
      const patterns = run(['patterns-for', 'src/core/a.ts', '--format', 'json']);
      expect(JSON.parse(patterns.stdout)).toMatchObject({ count: 1, patterns: [{ title: 'ports first' }] });
      expect(run(['memory', 'recall', '--query', 'inject', '--format', 'json']).stdout).toContain('"count": 1');
      expect(run(['memory', 'review']).stdout).toContain('unused_days: 90');
      expect(run(['memory', 'get', '01J00000000000000000000099']).status).toBe(2);
      const bad = run(['memory', 'save', '--kind', 'pattern', '--title', 't', '--content', 'c']);
      expect(bad.status).toBe(3);
      expect(bad.stderr).toContain('applies_to');
    } finally {
      iso.dispose();
    }
  }, 120_000);
});
