import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeFileSystem } from '../../../../src/core/adapters/node-file-system.ts';
import { PathGuard, isInside, isSafeSegment } from '../../../../src/core/security/path-guard.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';

const ROOT = resolve('/store');

describe('isSafeSegment', () => {
  it.each(['task.md', '01J0000000000000000000000A', 'github.com__scrapup__warlog'])('[WL-49] accepts %p', (s) => {
    expect(isSafeSegment(s)).toBe(true);
  });

  it.each(['', '.', '..', '../x', '..\\x', 'a/b', 'a\\b', 'C:', 'C:\\Windows', '%2e%2e', 'nul\0byte'])('[WL-49] rejects %p', (s) => {
    expect(isSafeSegment(s)).toBe(false);
  });
});

describe('isInside', () => {
  it('[WL-49] accepts the root and descendants and rejects siblings and parents', () => {
    expect(isInside(ROOT, ROOT)).toBe(true);
    expect(isInside(ROOT, join(ROOT, 'a', 'b'))).toBe(true);
    expect(isInside(ROOT, resolve('/store-other'))).toBe(false);
    expect(isInside(ROOT, resolve('/'))).toBe(false);
  });
});

describe('PathGuard (in memory)', () => {
  it('[WL-49] joins plain segments under the root', async () => {
    const guard = new PathGuard(new MemoryFileSystem());
    expect(await guard.resolveInside(ROOT, 'projects', '01J0000000000000000000000A', 'project.md')).toBe(
      join(ROOT, 'projects', '01J0000000000000000000000A', 'project.md'),
    );
  });

  it.each([['..'], ['../etc'], ['..\\..\\etc'], ['/etc/passwd'], ['C:\\Windows'], ['%2e%2e'], ['']])(
    '[WL-49] rejects the escaping segment %p',
    async (segment) => {
      await expect(new PathGuard(new MemoryFileSystem()).resolveInside(ROOT, 'vars', segment)).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    },
  );

  it('[WL-49] rejects a symbolic link pointing outside the root', async () => {
    const fs = new MemoryFileSystem({ '/outside/secret.md': 'x', '/store/keep.md': 'y' });
    fs.links.set('/store/evil', '/outside');
    await expect(new PathGuard(fs).resolveInside('/store', 'evil', 'secret.md')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'path escapes its root through a symbolic link',
    });
  });

  it('propagates file-system errors other than NOT_FOUND', async () => {
    const fs = new MemoryFileSystem();
    fs.realpath = async () => Promise.reject(new Error('EACCES'));
    await expect(new PathGuard(fs).resolveInside(ROOT, 'a')).rejects.toThrow('EACCES');
  });
});

describe('PathGuard (real file system)', () => {
  let dir = '';

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('[WL-49] rejects a real symbolic link (junction on Windows) escaping the root, accepts inner paths', async () => {
    dir = mkdtempSync(join(tmpdir(), 'warlog-guard-'));
    const root = join(dir, 'store');
    mkdirSync(join(root, 'inner'), { recursive: true });
    mkdirSync(join(dir, 'outside'));
    symlinkSync(join(dir, 'outside'), join(root, 'evil'), 'junction');
    const guard = new PathGuard(new NodeFileSystem());
    await expect(guard.resolveInside(root, 'evil', 'x.md')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await guard.resolveInside(root, 'inner', 'new', 'x.md')).toBe(join(root, 'inner', 'new', 'x.md'));
    expect(await guard.resolveInside(join(dir, 'missing-root'), 'x.md')).toBe(join(dir, 'missing-root', 'x.md'));
  });
});
