import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectedCodeLevelIds } from '../../../scripts/rules-coverage/rule-ids.ts';
import { runNode } from '../../support/run-node.ts';

let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'warlog-rules-'));
  const ids = expectedCodeLevelIds();
  writeFileSync(join(dir, 'spec.md'), ids.map((id) => `| ${id} | rule | Mandatory |`).join('\n'));
  writeFileSync(join(dir, 'pending.txt'), ids.filter((id) => id !== 'WL-01' && id !== 'WL-02').join('\n'));
});

beforeEach(() => {
  rmSync(join(dir, 'reports'), { recursive: true, force: true });
  rmSync(join(dir, 'out'), { recursive: true, force: true });
  mkdirSync(join(dir, 'reports'));
  const assertionResults = [{ title: '[WL-01] proven', status: 'passed', fullName: '[WL-01] proven' }];
  writeFileSync(join(dir, 'reports', 'unit.json'), JSON.stringify({ testResults: [{ assertionResults }] }));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Runs the rules-coverage script against the temporary fixtures.
 * @param extra - Extra arguments.
 * @returns The process result.
 */
function run(extra: string[]): ReturnType<typeof runNode> {
  const out = join(dir, 'out', 'rules-coverage.md');
  return runNode(['scripts/rules-coverage.ts', '--spec', join(dir, 'spec.md'), '--reports', join(dir, 'reports'), '--out', out, ...extra], {
    timeoutMs: 25_000,
  });
}

describe('rules:coverage script (plan §7.4)', () => {
  it('fails listing unproven code-level rules', () => {
    const result = run(['--allow-missing', join(dir, 'pending.txt')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unproven: WL-02');
  }, 30_000);

  it('passes once the missing rule is tolerated and writes the evidence file', () => {
    writeFileSync(join(dir, 'pending-all.txt'), expectedCodeLevelIds().filter((id) => id !== 'WL-01').join('\n'));
    const result = run(['--allow-missing', join(dir, 'pending-all.txt')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('rules proven 1/72, pending 71');
    expect(readFileSync(join(dir, 'out', 'rules-coverage.md'), 'utf8')).toContain('| WL-01 | proven | [WL-01] proven |');
  }, 30_000);

  it('fails naming a malformed report', () => {
    writeFileSync(join(dir, 'reports', 'zz-bad.json'), '{');
    const result = run(['--allow-missing', join(dir, 'pending.txt')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('malformed Jest report zz-bad.json');
  }, 30_000);

  it('reports invalid arguments without a stack trace', () => {
    const result = runNode(['scripts/rules-coverage.ts', '--nope', 'x'], { timeoutMs: 25_000 });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe('rules-coverage failed: invalid argument: --nope');
  }, 30_000);
});
