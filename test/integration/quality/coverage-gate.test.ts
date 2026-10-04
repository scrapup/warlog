import { describe, expect, it } from '@jest/globals';
import { runNode } from '../../support/run-node.ts';

const JEST = 'node_modules/jest/bin/jest.js';
const FIXTURE = 'test/fixtures/coverage-gate/jest.config.mjs';

/**
 * Runs the coverage-gate fixture project.
 * @param coverAll - Whether the fixture test exercises every line.
 * @returns The process result.
 */
function runFixture(coverAll: boolean): ReturnType<typeof runNode> {
  return runNode(['--no-warnings', '--experimental-vm-modules', JEST, '--config', FIXTURE, '--coverage'], {
    env: { COVER_ALL: coverAll ? '1' : '0' },
  });
}

describe('unit coverage gate (plan §7.3)', () => {
  it('fails a project below 95 % (fixture at ~94 % statements)', () => {
    const result = runFixture(false);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/Coverage for statements \(94\.\d+%\) does not meet "global" threshold \(95%\)/);
  }, 120_000);

  it('passes the same project at 100 %', () => {
    const result = runFixture(true);
    expect(result.stderr).not.toContain('does not meet');
    expect(result.status).toBe(0);
  }, 120_000);
});
