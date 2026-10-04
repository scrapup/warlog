import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../src/core/adapters/node-file-system.ts';
import { NodeRecursiveWatcher } from '../../../src/core/adapters/node-recursive-watcher.ts';
import { NODE_TIMERS } from '../../../src/core/adapters/node-timers.ts';
import { SystemClock } from '../../../src/core/adapters/system-clock.ts';
import { IndexBuilder } from '../../../src/core/index/index-builder.ts';
import type { StoreIndex } from '../../../src/core/index/store-index.ts';
import { WatcherService } from '../../../src/core/index/watcher-service.ts';
import { stringifyFrontMatter } from '../../../src/core/storage/front-matter-codec.ts';
import type { StoreRoots } from '../../../src/core/storage/store-roots.ts';
import { RecordingLogger } from '../../support/fakes/simple-fakes.ts';

const M1 = '01J00000000000000000000M01';
const M2 = '01J00000000000000000000M02';

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
});

/**
 * Writes a memory file.
 * @param dir - Memories directory.
 * @param id - Memory id.
 */
function writeMemory(dir: string, id: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.md`), stringifyFrontMatter({ data: { id, type: 'memory', rev: 1, created_at: 'x', updated_at: 'x', machine: 'm', title: id }, body: '' }));
}

/**
 * Polls until the index holds an entity.
 * @param index - View.
 * @param id - Entity id.
 * @param timeoutMs - Limit.
 * @returns Elapsed milliseconds.
 */
async function waitFor(index: StoreIndex, id: string, timeoutMs: number): Promise<number> {
  const start = Date.now();
  while (index.get(id) === undefined) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${id} not indexed after ${timeoutMs} ms`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return Date.now() - start;
}

/**
 * Starts a watcher service over a temporary store.
 * @param watchedGlobal - Global root actually watched (a missing directory forces a watcher error).
 * @returns Service, index, logger and roots.
 */
async function start(watchedGlobal?: string) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'warlog-watch-')));
  const roots: StoreRoots = { global: join(base, 'global'), warnings: [] };
  mkdirSync(roots.global, { recursive: true });
  writeMemory(join(roots.global, 'global', 'memories'), M1);
  const builder = new IndexBuilder({ fs: new NodeFileSystem(), clock: new SystemClock() });
  const { index } = await builder.build(roots);
  const logger = new RecordingLogger();
  const watchRoots: StoreRoots = watchedGlobal === undefined ? roots : { ...roots, global: join(base, watchedGlobal) };
  const service = new WatcherService({ watcher: new NodeRecursiveWatcher(), builder, index, roots: watchRoots, logger, timers: NODE_TIMERS });
  service.start();
  cleanups.push(() => {
    service.stop();
    rmSync(base, { recursive: true, force: true });
  });
  return { service, index, logger, roots, watchRoots };
}

describe('watcher on the real file system', () => {
  it('[WL-06] shows an external write in the view within 1 s', async () => {
    const { index, roots } = await start();
    expect(index.get(M1)).toBeDefined();
    await new Promise((r) => setTimeout(r, 100));
    writeMemory(join(roots.global, 'global', 'memories'), M2);
    expect(await waitFor(index, M2, 1_000)).toBeLessThanOrEqual(1_000);
  }, 10_000);

  it('[WL-06] switches to rescans when the watcher fails and still picks up changes', async () => {
    const { service, index, logger, watchRoots } = await start('missing');
    await new Promise((r) => setTimeout(r, 50));
    expect(service.fallback).toBe(true);
    expect(logger.events.map((e) => e.event)).toContain('watcher.fallback');
    writeMemory(join(watchRoots.global, 'global', 'memories'), M2);
    await waitFor(index, M2, 7_000);
  }, 15_000);
});
