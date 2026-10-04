import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { loadStoreFile, readRegularFile } from '../../../../src/core/index/file-loader.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { REPO_ROOT } from '../../../support/store-fixture.ts';

describe('file loader', () => {
  it('[WL-43] refuses missing, directory and unreadable entries with a reason', async () => {
    const fs = new MemoryFileSystem({ [join(REPO_ROOT, 'a', 'b.md')]: 'x' });
    expect(await readRegularFile(fs, join(REPO_ROOT, 'none.md'))).toEqual({ reason: 'missing' });
    expect(await readRegularFile(fs, join(REPO_ROOT, 'a'))).toEqual({ reason: 'not_regular' });
    fs.readFile = async () => {
      throw new Error('odd');
    };
    expect(await readRegularFile(fs, join(REPO_ROOT, 'a', 'b.md'))).toEqual({ reason: 'unreadable' });
    const file = { root: 'repo' as const, relative: 'a/b.md', path: join(REPO_ROOT, 'a', 'b.md') };
    expect(await loadStoreFile(fs, file)).toEqual({ kind: 'invalid', reason: 'unreadable' });
  });
});
