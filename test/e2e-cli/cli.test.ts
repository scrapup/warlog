import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('warlog links and trace from the packed tarball', () => {
  it('[WL-21] [WL-22] [WL-23] links a task to a spec, a commit and a tracker key, then traces them', () => {
    const iso = isolatedEnv();
    try {
      execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: iso.cwd });
      const run = (args: string[]): ReturnType<typeof runNode> => runNode([bin(), ...args], { cwd: iso.cwd, env: iso.env, timeoutMs: 25_000 });
      const json = (args: string[]): Record<string, unknown> => {
        const result = run([...args, '--format', 'json']);
        expect([args.join(' '), result.status, result.stderr]).toEqual([args.join(' '), 0, '']);
        return JSON.parse(result.stdout) as Record<string, unknown>;
      };
      const project = String(json(['project', 'create', '--name', 'p'])['id']);
      const epic = String(json(['epic', 'create', '--project-id', project, '--name', 'E'])['id']);
      const taskId = String(json(['task', 'create', '--epic-id', epic, '--title', 'Tokenize'])['id']);
      json(['link', 'add', '--id', taskId, '--rel', 'implements', '--target', 'spec:docs/spec.md#us-1']);
      json(['link', 'add', '--id', taskId, '--rel', 'commit', '--target', 'git:abc1234']);
      json(['external', 'link', '--id', taskId, '--system', 'jira', '--key', 'SQ-1']);
      const traced = json(['trace', taskId]);
      expect(traced['matrix']).toMatchObject({ use_case: ['spec:docs/spec.md#us-1'], commit: ['git:abc1234'], task: [expect.stringContaining('Tokenize')] });
      expect(run(['link', 'of', 'git:abc1234']).stdout).toContain('commit');
      expect(json(['external', 'find', '--system', 'jira', '--key', 'SQ-1'])).toMatchObject({ id: taskId, type: 'task' });
      expect(run(['external', 'find', '--system', 'jira', '--key', 'nope']).status).toBe(2);
      const bad = run(['link', 'add', '--id', taskId, '--rel', 'relates', '--target', 'nonsense']);
      expect(bad.status).toBe(3);
      expect(bad.stderr).toContain('target');
    } finally {
      iso.dispose();
    }
  }, 120_000);
});

describe('warlog After-Action Review from the packed tarball', () => {
  it('[WL-29] [WL-31] [WL-32] [WL-33] answers the built-in aar from a file and promotes a lesson', () => {
    const iso = isolatedEnv();
    try {
      execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: iso.cwd });
      const run = (args: string[]): ReturnType<typeof runNode> => runNode([bin(), ...args], { cwd: iso.cwd, env: iso.env, timeoutMs: 25_000 });
      const json = (args: string[]): Record<string, unknown> => {
        const result = run([...args, '--format', 'json']);
        expect([args.join(' '), result.status, result.stderr]).toEqual([args.join(' '), 0, '']);
        return JSON.parse(result.stdout) as Record<string, unknown>;
      };
      expect(run(['questionnaire', 'get', 'aar']).stdout).toContain('title: After-Action Review');
      expect(run(['questionnaire', 'list']).stdout).toContain('aar');
      const project = String(json(['project', 'create', '--name', 'p'])['id']);
      const file = join(iso.cwd, 'answers.yaml');
      writeFileSync(file, `questionnaire: aar\nsubject_id: ${project}\nanswers:\n  outcome: partial\n  trigger: milestone\n  expected: one PR\n  happened: three PRs\n  why_difference: stacked reviews\n  improve:\n    - smaller stories\n`);
      const invalid = run(['response', 'create', '--questionnaire', 'aar', '--subject-id', project, '--json-input', JSON.stringify({ answers: { outcome: 'nope' } })]);
      expect(invalid.status).toBe(3);
      expect(invalid.stderr).toContain('answers.expected');
      const response = json(['response', 'create', '--file', file]);
      expect(response).toMatchObject({ questionnaire: 'aar', subject: { type: 'project', id: project } });
      const promoted = json(['response', 'promote', '--response-id', String(response['id']), '--question-id', 'improve', '--item-index', '0']);
      expect(promoted['memory']).toMatchObject({ kind: 'guardrail', title: 'smaller stories' });
      expect(json(['response', 'get', String(response['id'])])).toMatchObject({ answers: { outcome: 'partial' } });
      expect(run(['memory', 'recall', '--query', 'smaller stories', '--format', 'json']).stdout).toContain('"count": 1');
      expect(run(['response', 'get', '01J00000000000000000000099']).status).toBe(2);
    } finally {
      iso.dispose();
    }
  }, 120_000);
});

describe('warlog document registry from the packed tarball', () => {
  it('[WL-60] [WL-61] [WL-66] [WL-68] registers a folder by path, reads one section, searches and exports it', () => {
    const iso = isolatedEnv();
    try {
      execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: iso.cwd });
      const run = (args: string[]): ReturnType<typeof runNode> => runNode([bin(), ...args], { cwd: iso.cwd, env: iso.env, timeoutMs: 25_000 });
      const json = (args: string[]): Record<string, unknown> => {
        const result = run([...args, '--format', 'json']);
        expect([args.join(' '), result.status, result.stderr]).toEqual([args.join(' '), 0, '']);
        return JSON.parse(result.stdout) as Record<string, unknown>;
      };
      const folder = join(iso.cwd, 'docs', 'specs', 'core', 'alpha');
      mkdirSync(join(folder, 'diagrams'), { recursive: true });
      writeFileSync(join(folder, 'design.md'), '# Design\n\n## Flow\n\n![flow](diagrams/flow.png)\n\nRollback is manual.\n\n## Notes\n\nNothing.\n');
      writeFileSync(join(folder, 'diagrams', 'flow.png'), 'PNG');
      const imported = json(['doc', 'import', 'docs/specs/core/alpha']);
      expect(imported).toMatchObject({ epic: 'core', opportunity: 'alpha', documents: [{ kind: 'design', assets: 1 }] });
      expect(JSON.stringify(imported)).not.toContain('Rollback');
      const id = String((imported['documents'] as { id: string }[])[0]?.id);
      expect(run(['doc', 'toc', id]).stdout).toContain('flow');
      expect(run(['doc', 'get', id, '--section', 'notes']).stdout).toContain('Nothing.');
      expect(run(['doc', 'search', '--id', id, '--query', 'rollback']).stdout).toContain('flow');
      expect(run(['doc', 'list']).stdout).toContain('design');
      expect(run(['doc', 'get', '01J00000000000000000000099']).status).toBe(2);
      expect(run(['doc', 'import', '../outside.md']).status).not.toBe(0);
      const exported = json(['doc', 'export', '--id', id, '--path', 'out']);
      expect(exported['assets']).toBe(1);
      expect(readFileSync(join(iso.cwd, 'out', 'design.md'), 'utf8')).toContain('![flow](diagrams/flow.png)');
      expect(existsSync(join(iso.cwd, 'out', 'diagrams', 'flow.png'))).toBe(true);
    } finally {
      iso.dispose();
    }
  }, 120_000);
});
