import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeRecursiveWatcher } from '../../../../src/core/adapters/node-recursive-watcher.ts';
import { NodeTimers } from '../../../../src/core/adapters/node-timers.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
});

/**
 * Waits until a condition holds.
 * @param check - Condition.
 * @param timeoutMs - Limit.
 * @returns When the condition holds.
 */
async function until(check: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('condition not met');
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('NodeRecursiveWatcher', () => {
  it('reports a missing root through onError', async () => {
    const errors: Error[] = [];
    const stop = new NodeRecursiveWatcher().watch(join(tmpdir(), 'warlog-missing-root-xyz'), () => undefined, (e) => errors.push(e));
    await until(() => errors.length === 1);
    expect(Reflect.get(errors[0] ?? {}, 'code')).toBe('ENOENT');
    stop();
  });

  it('reports a root that is a file through onError', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'warlog-watch-file-')));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'f'), 'x');
    const errors: Error[] = [];
    new NodeRecursiveWatcher().watch(join(dir, 'f'), () => undefined, (e) => errors.push(e));
    await until(() => errors.length === 1);
    expect(Reflect.get(errors[0] ?? {}, 'code')).toBe('ENOTDIR');
  });

  it('reports changed files relative to the root until stopped', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'warlog-watch-unit-')));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const changes: string[] = [];
    const stop = new NodeRecursiveWatcher().watch(dir, (rel) => changes.push(rel), () => undefined);
    cleanups.push(stop);
    await until(() => {
      writeFileSync(join(dir, 'a.md'), 'x');
      return changes.includes('a.md');
    });
    expect(changes).toContain('a.md');
  }, 10_000);
});

describe('NodeTimers', () => {
  it('runs and cancels unreferenced timers', async () => {
    const timers = new NodeTimers();
    let ran = 0;
    timers.setTimeout(() => {
      ran += 1;
    }, 1);
    timers.clearTimeout(
      timers.setTimeout(() => {
        ran += 10;
      }, 1),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(ran).toBe(1);
  });
});
