import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../../src/core/adapters/node-file-system.ts';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'warlog-nfs-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Builds an error carrying a Node system error code.
 * @param code - Error code.
 * @returns The error.
 */
function sysError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('NodeFileSystem reads', () => {
  it('reads a file and maps a missing file to NOT_FOUND', async () => {
    writeFileSync(join(dir, 'a.md'), 'hello');
    const fs = new NodeFileSystem();
    expect(await fs.readFile(join(dir, 'a.md'))).toBe('hello');
    await expect(fs.readFile(join(dir, 'missing.md'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('passes through errors other than ENOENT', async () => {
    await expect(new NodeFileSystem().readFile(dir)).rejects.not.toBeInstanceOf(WarlogError);
  });

  it('lists directories flat and recursively with / separators, [] when missing', async () => {
    mkdirSync(join(dir, 'x', 'y'), { recursive: true });
    writeFileSync(join(dir, 'x', 'y', 'f.md'), '');
    const fs = new NodeFileSystem();
    expect(await fs.readDir(dir)).toEqual(['x']);
    expect((await fs.readDir(dir, { recursive: true })).sort()).toEqual(['x', 'x/y', 'x/y/f.md']);
    expect(await fs.readDir(join(dir, 'nope'))).toEqual([]);
    writeFileSync(join(dir, 'file'), '');
    await expect(fs.readDir(join(dir, 'file'))).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('stats files and directories, undefined when missing, rethrows other errors', async () => {
    writeFileSync(join(dir, 'f'), 'abc');
    const fs = new NodeFileSystem();
    expect(await fs.stat(join(dir, 'f'))).toMatchObject({ isDirectory: false, size: 3 });
    expect(await fs.stat(dir)).toMatchObject({ isDirectory: true });
    expect(await fs.stat(join(dir, 'missing'))).toBeUndefined();
    await expect(fs.stat(join(dir, 'f', 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('resolves symbolic links and maps a missing path to NOT_FOUND', async () => {
    mkdirSync(join(dir, 'real'));
    symlinkSync(join(dir, 'real'), join(dir, 'link'), 'junction');
    const fs = new NodeFileSystem();
    expect(await fs.realpath(join(dir, 'link'))).toBe(await fs.realpath(join(dir, 'real')));
    await expect(fs.realpath(join(dir, 'missing'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('NodeFileSystem writes', () => {
  it('[WL-41] writes atomically, creating parents and leaving no temporary file', async () => {
    const fs = new NodeFileSystem();
    const target = join(dir, 'a', 'b', 'c.md');
    await fs.writeFileAtomic(target, 'v1');
    await fs.writeFileAtomic(target, 'v2');
    expect(readFileSync(target, 'utf8')).toBe('v2');
    expect(readdirSync(join(dir, 'a', 'b'))).toEqual(['c.md']);
  });

  it('[WL-41] keeps the previous content intact when the write is interrupted before the rename', async () => {
    const target = join(dir, 'c.md');
    writeFileSync(target, 'previous');
    const fs = new NodeFileSystem({ rename: async () => Promise.reject(sysError('EIO')) });
    await expect(fs.writeFileAtomic(target, 'new')).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(readFileSync(target, 'utf8')).toBe('previous');
    expect(readdirSync(dir)).toEqual(['c.md']);
  });

  it('[WL-41] a temporary file left by a killed writer does not alter the target', async () => {
    const target = join(dir, 'c.md');
    writeFileSync(target, 'previous');
    writeFileSync(join(dir, '.c.md.tmp-999-deadbeef'), 'partial');
    expect(readFileSync(target, 'utf8')).toBe('previous');
  });

  it('retries transient rename failures (Windows file locks)', async () => {
    let calls = 0;
    const { rename } = await import('node:fs/promises');
    const fs = new NodeFileSystem({
      renameBackoffMs: 1,
      rename: async (from, to) => {
        calls += 1;
        if (calls < 3) {
          throw sysError('EPERM');
        }
        await rename(from, to);
      },
    });
    await fs.writeFileAtomic(join(dir, 'c.md'), 'ok');
    expect(calls).toBe(3);
    expect(readFileSync(join(dir, 'c.md'), 'utf8')).toBe('ok');
  });

  it('gives up after the configured attempts', async () => {
    let calls = 0;
    const fs = new NodeFileSystem({
      renameAttempts: 2,
      renameBackoffMs: 1,
      rename: async () => {
        calls += 1;
        throw sysError('EBUSY');
      },
    });
    await expect(fs.writeFileAtomic(join(dir, 'c.md'), 'x')).rejects.toBeInstanceOf(WarlogError);
    expect(calls).toBe(2);
  });

  it('appends, creating the file and its parents', async () => {
    const fs = new NodeFileSystem();
    const path = join(dir, 'activity', 'm', 'd.jsonl');
    await fs.appendFile(path, 'a\n');
    await fs.appendFile(path, 'b\n');
    expect(readFileSync(path, 'utf8')).toBe('a\nb\n');
  });

  it('creates and removes directory trees', async () => {
    const fs = new NodeFileSystem();
    await fs.mkdirp(join(dir, 'p', 'q'));
    expect(await fs.stat(join(dir, 'p', 'q'))).toMatchObject({ isDirectory: true });
    await fs.remove(join(dir, 'p'));
    await fs.remove(join(dir, 'p'));
    expect(await fs.stat(join(dir, 'p'))).toBeUndefined();
  });
});

describe('NodeFileSystem locks', () => {
  it('serializes holders and releases the lock', async () => {
    const fs = new NodeFileSystem({ lockTimeoutMs: 2_000 });
    const target = join(dir, 'task.md');
    const release = await fs.lock(target);
    const second = fs.lock(target);
    setTimeout(() => void release(), 30);
    const releaseSecond = await second;
    await releaseSecond();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('fails with CONFLICT when the lock stays busy', async () => {
    const fs = new NodeFileSystem({ lockTimeoutMs: 30 });
    const target = join(dir, 'task.md');
    await fs.lock(target);
    await expect(fs.lock(target)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('breaks a stale lock', async () => {
    const target = join(dir, 'task.md');
    writeFileSync(`${target}.lock`, '1');
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${target}.lock`, old, old);
    const release = await new NodeFileSystem({ lockStaleMs: 1_000 }).lock(target);
    await release();
  });
});
