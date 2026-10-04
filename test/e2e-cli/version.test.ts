import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
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

describe('warlog bin from the packed tarball', () => {
  it.each([['--version'], ['-V']])('prints the package version for %s', (flag) => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const result = runNode([bin(), flag], { timeoutMs: 25_000 });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  }, 30_000);

  it('exits 1 on an unknown invocation', () => {
    const result = runNode([bin()], { timeoutMs: 25_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('command line not implemented yet');
  }, 30_000);
});
