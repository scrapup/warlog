import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../../src/core/adapters/node-file-system.ts';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { RecordingLogger } from '../../../support/fakes/simple-fakes.ts';

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

  it('passes through errors other than ENOENT unchanged', async () => {
    await expect(new NodeFileSystem().readFile(dir)).rejects.toMatchObject({ code: 'EISDIR' });
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

  it('stats files and directories, undefined when missing on every platform', async () => {
    writeFileSync(join(dir, 'f'), 'abc');
    const fs = new NodeFileSystem();
    expect(await fs.stat(join(dir, 'f'))).toMatchObject({ isDirectory: false, size: 3 });
    expect(await fs.stat(dir)).toMatchObject({ isDirectory: true });
    expect(await fs.stat(join(dir, 'missing'))).toBeUndefined();
    expect(await fs.stat(join(dir, 'f', 'child'))).toBeUndefined();
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

  it('[WL-41] an orphan temporary file left by a killed writer neither blocks nor leaks into the next write', async () => {
    const target = join(dir, 'c.md');
    writeFileSync(target, 'previous');
    writeFileSync(join(dir, '.c.md.tmp-999-deadbeef'), 'partial');
    const fs = new NodeFileSystem();
    expect(await fs.readFile(target)).toBe('previous');
    await fs.writeFileAtomic(target, 'next');
    expect(await fs.readFile(target)).toBe('next');
    expect(readdirSync(dir).sort()).toEqual(['.c.md.tmp-999-deadbeef', 'c.md']);
    expect(readFileSync(join(dir, '.c.md.tmp-999-deadbeef'), 'utf8')).toBe('partial');
  });

  it('[WL-41] removes the temporary file on failure and reports only the file name', async () => {
    writeFileSync(join(dir, 'c.md'), 'ok');
    const failing = new NodeFileSystem({ rename: async () => Promise.reject(sysError('ENOSPC')) });
    await expect(failing.writeFileAtomic(join(dir, 'd.md'), 'data')).rejects.toMatchObject({ code: 'INTERNAL', details: { file: 'd.md' } });
    expect(readdirSync(dir)).toEqual(['c.md']);
  });

  it('retries transient rename failures (Windows file locks)', async () => {
    let calls = 0;
    const { rename } = await import('node:fs/promises');
    const logger = new RecordingLogger();
    const fs = new NodeFileSystem({
      logger,
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
    expect(logger.events.map((e) => e.fields)).toEqual([
      { attempt: 1, sys_code: 'EPERM' },
      { attempt: 2, sys_code: 'EPERM' },
    ]);
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
  it('[WL-42] serializes holders: the second acquires only after the first releases', async () => {
    const fs = new NodeFileSystem({ lockTimeoutMs: 2_000 });
    const target = join(dir, 'task.md');
    const order: string[] = [];
    const release = await fs.lock(target);
    const second = fs.lock(target).then((r) => {
      order.push('acquired-2');
      return r;
    });
    await new Promise((r) => setTimeout(r, 40));
    order.push('release-1');
    await release();
    await (await second)();
    expect(order).toEqual(['release-1', 'acquired-2']);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('[WL-42] uses a hidden lock file next to the entity', async () => {
    const release = await new NodeFileSystem().lock(join(dir, 'task.md'));
    expect(readdirSync(dir)).toEqual(['.task.md.lock']);
    await release();
  });

  it('fails with CONFLICT (reason locked) when the lock stays busy', async () => {
    const fs = new NodeFileSystem({ lockTimeoutMs: 30 });
    const target = join(dir, 'task.md');
    await fs.lock(target);
    await expect(fs.lock(target)).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'locked' } });
  });

  it('breaks a stale lock atomically and logs it', async () => {
    const target = join(dir, 'task.md');
    writeFileSync(join(dir, '.task.md.lock'), 'dead-holder');
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(dir, '.task.md.lock'), old, old);
    const logger = new RecordingLogger();
    const release = await new NodeFileSystem({ lockStaleMs: 1_000, lockTimeoutMs: 500, logger }).lock(target);
    expect(readFileSync(join(dir, '.task.md.lock'), 'utf8')).toMatch(new RegExp(`^${process.pid}-[0-9a-f]{16}$`));
    await release();
    expect(readdirSync(dir)).toEqual([]);
    expect(logger.events.map((e) => e.event)).toEqual(['fs.lock_stale_broken']);
  });

  it('treats a lock with a future modification time (clock skew) as stale', async () => {
    const target = join(dir, 'task.md');
    writeFileSync(join(dir, '.task.md.lock'), 'skewed');
    const future = new Date(Date.now() + 3_600_000);
    utimesSync(join(dir, '.task.md.lock'), future, future);
    const logger = new RecordingLogger();
    const release = await new NodeFileSystem({ lockStaleMs: 1_000, lockTimeoutMs: 500, logger }).lock(target);
    await release();
    expect(logger.events.map((e) => e.fields['future_mtime'])).toEqual([true]);
  });

  it('[WL-42] two waiters on one stale lock both end up holding it, one after the other', async () => {
    const target = join(dir, 'task.md');
    writeFileSync(join(dir, '.task.md.lock'), 'dead-holder');
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(dir, '.task.md.lock'), old, old);
    const logger = new RecordingLogger();
    const fs = new NodeFileSystem({ lockStaleMs: 1_000, lockTimeoutMs: 3_000, logger });
    const order: string[] = [];
    const take = async (name: string): Promise<void> => {
      const release = await fs.lock(target);
      order.push(`in-${name}`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`out-${name}`);
      await release();
    };
    await Promise.all([take('a'), take('b')]);
    expect(order[0]?.startsWith('in-')).toBe(true);
    expect(order[1]?.startsWith('out-')).toBe(true);
    expect(order[0]?.slice(3)).toBe(order[1]?.slice(4));
    expect(logger.events.filter((e) => e.event === 'fs.lock_stale_broken')).toHaveLength(1);
  });

  it('rethrows I/O errors instead of waiting for a lock that can never be created', async () => {
    writeFileSync(join(dir, 'file'), '');
    await expect(new NodeFileSystem({ lockTimeoutMs: 2_000 }).lock(join(dir, 'file', 'task.md'))).rejects.toMatchObject({
      code: expect.stringMatching(/^E(EXIST|NOTDIR)$/),
    });
  });

  it('[WL-42] fails fast (not CONFLICT) when the directory cannot be written', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) {
      return;
    }
    const locked = join(dir, 'ro');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
      await expect(new NodeFileSystem({ lockTimeoutMs: 2_000 }).lock(join(locked, 'task.md'))).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      chmodSync(locked, 0o700);
    }
  });

  it('[WL-42] never removes a lock it no longer owns', async () => {
    const target = join(dir, 'task.md');
    const release = await new NodeFileSystem().lock(target);
    writeFileSync(join(dir, '.task.md.lock'), 'another-holder');
    await release();
    expect(readFileSync(join(dir, '.task.md.lock'), 'utf8')).toBe('another-holder');
  });
});
