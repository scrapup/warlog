import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNode } from '../../support/run-node.ts';

let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'warlog-rules-'));
  writeFileSync(join(dir, 'spec.md'), '| WL-01 | a | b |\n| WL-02 | a | b |\n| SEC-05 | a | b |\n');
  mkdirSync(join(dir, 'reports'));
  const assertionResults = [{ title: '[WL-01] proven', status: 'passed', fullName: '[WL-01] proven' }];
  writeFileSync(join(dir, 'reports', 'unit.json'), JSON.stringify({ testResults: [{ assertionResults }] }));
  writeFileSync(join(dir, 'pending.txt'), 'WL-02\n');
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
  return runNode(['scripts/rules-coverage.ts', '--spec', join(dir, 'spec.md'), '--reports', join(dir, 'reports'), '--out', out, ...extra]);
}

describe('rules:coverage script (plan §7.4)', () => {
  it('fails listing unproven code-level rules', () => {
    const result = run([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unproven: WL-02');
  });

  it('passes with an allow-missing list and writes the evidence file', () => {
    const result = run(['--allow-missing', join(dir, 'pending.txt')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('rules proven 1/2, pending 1');
    expect(readFileSync(join(dir, 'out', 'rules-coverage.md'), 'utf8')).toContain('| WL-01 | proven | [WL-01] proven |');
  });

  it('fails naming a malformed report', () => {
    writeFileSync(join(dir, 'reports', 'zz-bad.json'), '{');
    const result = run(['--allow-missing', join(dir, 'pending.txt')]);
    rmSync(join(dir, 'reports', 'zz-bad.json'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('malformed Jest report zz-bad.json');
  });
});
