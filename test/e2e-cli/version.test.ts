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

describe('warlog bin from the packed tarball', () => {
  it('prints the package version', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const result = runNode([installed?.bin ?? '', '--version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  });

  it('exits 1 on an unknown invocation', () => {
    const result = runNode([installed?.bin ?? '']);
    expect(result.status).toBe(1);
  });
});
