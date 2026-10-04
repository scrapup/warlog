import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../../src/core/adapters/node-file-system.ts';

const dirs: string[] = [];

afterEach(() => {
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

/**
 * A fresh temporary directory.
 * @returns Its real path.
 */
function temp(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'warlog-reads-')));
  dirs.push(dir);
  return dir;
}

describe('NodeFileSystem listing and bounded reads', () => {
  it('lists every descendant with its kind, and nothing for a missing directory', async () => {
    const dir = temp();
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'a', 'f.md'), 'x');
    const fs = new NodeFileSystem();
    const entries = await fs.listTree(dir);
    expect(entries.sort((x, y) => (x.relative < y.relative ? -1 : 1))).toEqual([
      { relative: 'a', kind: 'directory' },
      { relative: 'a/f.md', kind: 'file' },
    ]);
    expect(await fs.listTree(join(dir, 'missing'))).toEqual([]);
    await expect(fs.listTree(join(dir, 'a', 'f.md'))).rejects.toThrow();
  });

  it('reads small and multi-chunk files and refuses files above the limit', async () => {
    const dir = temp();
    const fs = new NodeFileSystem();
    writeFileSync(join(dir, 'empty'), '');
    writeFileSync(join(dir, 'small'), 'héllo');
    const big = 'b'.repeat(200 * 1024);
    writeFileSync(join(dir, 'big'), big);
    expect(await fs.readFileBounded(join(dir, 'empty'), 10)).toBe('');
    expect(await fs.readFileBounded(join(dir, 'small'), 10)).toBe('héllo');
    expect(await fs.readFileBounded(join(dir, 'big'), 300 * 1024)).toBe(big);
    expect(await fs.readFileBounded(join(dir, 'big'), 100 * 1024)).toBeUndefined();
  });

  it('reports links in listings and refuses to read through a final link where supported', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const dir = temp();
    writeFileSync(join(dir, 'target'), 'secret');
    symlinkSync(join(dir, 'target'), join(dir, 'link'));
    const fs = new NodeFileSystem();
    expect((await fs.listTree(dir)).find((e) => e.relative === 'link')?.kind).toBe('symlink');
    await expect(fs.readFileBounded(join(dir, 'link'), 100)).rejects.toMatchObject({ code: 'ELOOP' });
    expect(await fs.lstat(join(dir, 'link'))).toMatchObject({ isSymbolicLink: true, isFile: false });
  });
});
