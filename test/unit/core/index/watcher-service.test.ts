import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { IndexBuilder } from '../../../../src/core/index/index-builder.ts';
import { DEBOUNCE_MS, RESCAN_MS, WatcherService } from '../../../../src/core/index/watcher-service.ts';
import type { StopWatching, Watcher } from '../../../../src/core/ports/watcher.port.ts';
import { stringifyFrontMatter } from '../../../../src/core/storage/front-matter-codec.ts';
import type { StoreRoots } from '../../../../src/core/storage/store-roots.ts';
import { ManualTimers } from '../../../support/fakes/manual-timers.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { FixedClock, RecordingLogger } from '../../../support/fakes/simple-fakes.ts';
import { GLOBAL_ROOT, REPO_ROOT } from '../../../support/store-fixture.ts';

const ROOTS: StoreRoots = { global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo', mainWorktree: join(REPO_ROOT, '..') }, warnings: [] };
const M1 = '01J00000000000000000000M01';
const M2 = '01J00000000000000000000M02';

/** Watcher driven by the test. */
class FakeWatcher implements Watcher {
  /** Change callbacks by root. */
  readonly changes = new Map<string, (relative: string) => void>();
  /** Error callbacks. */
  readonly errors: ((error: Error) => void)[] = [];
  /** Stopped roots. */
  readonly stopped: string[] = [];

  /**
   * Registers a watch.
   * @param root - Root.
   * @param onChange - Change callback.
   * @param onError - Error callback.
   * @returns Stop function.
   */
  watch(root: string, onChange: (relative: string) => void, onError: (error: Error) => void): StopWatching {
    this.changes.set(root, onChange);
    this.errors.push(onError);
    return () => {
      this.stopped.push(root);
    };
  }
}

/**
 * A memory file.
 * @param id - Memory id.
 * @param title - Title.
 * @returns File content.
 */
function memory(id: string, title: string): string {
  return stringifyFrontMatter({ data: { id, type: 'memory', rev: 1, created_at: 'x', updated_at: 'x', machine: 'm', title }, body: '' });
}

/**
 * Lets pending promises settle.
 * @returns After the microtask queue drains.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setImmediate(r));
  }
}

/**
 * Starts a service over a memory store holding one memory.
 * @returns Service and fakes.
 */
async function setup() {
  const fs = new MemoryFileSystem({ [join(REPO_ROOT, 'memories', `${M1}.md`)]: memory(M1, 'one') });
  const builder = new IndexBuilder({ fs, clock: new FixedClock() });
  const { index } = await builder.build(ROOTS);
  const watcher = new FakeWatcher();
  const timers = new ManualTimers();
  const logger = new RecordingLogger();
  const service = new WatcherService({ watcher, builder, index, roots: ROOTS, logger, timers });
  service.start();
  return { fs, index, watcher, timers, logger, service };
}

describe('WatcherService', () => {
  it('[WL-06] applies an external change once after the debounce', async () => {
    const { fs, index, watcher, timers } = await setup();
    fs.files.set(join(REPO_ROOT, 'memories', `${M2}.md`), memory(M2, 'two'));
    const onRepo = watcher.changes.get(REPO_ROOT);
    onRepo?.(`memories/${M2}.md`);
    onRepo?.(`memories/${M2}.md`);
    timers.advance(DEBOUNCE_MS - 1);
    await settle();
    expect(index.get(M2)).toBeUndefined();
    timers.advance(1);
    await settle();
    expect(index.get(M2)?.record.data['title']).toBe('two');
    expect(timers.size).toBe(0);
  });

  it('ignores temp files and rescans when the watcher cannot name the file', async () => {
    const { fs, index, watcher, timers } = await setup();
    watcher.changes.get(REPO_ROOT)?.(`memories/.${M1}.md.tmp-1-x`);
    expect(timers.size).toBe(0);
    fs.files.set(join(GLOBAL_ROOT, 'global', 'memories', `${M2}.md`), memory(M2, 'g'));
    watcher.changes.get(GLOBAL_ROOT)?.('');
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(index.get(M2)?.scope).toBe('global');
  });

  it('falls back to rescans every 5 s after a watcher error and logs it once', async () => {
    const { fs, index, watcher, timers, logger, service } = await setup();
    watcher.errors[0]?.(Object.assign(new Error('too many'), { code: 'EMFILE' }));
    watcher.errors[1]?.(new Error('again'));
    expect(service.fallback).toBe(true);
    expect(watcher.stopped).toEqual([GLOBAL_ROOT, REPO_ROOT]);
    expect(logger.events).toEqual([{ level: 'warn', event: 'watcher.fallback', fields: { error_code: 'UNEXPECTED', error_name: 'Error', sys_code: 'EMFILE' } }]);
    fs.files.delete(join(REPO_ROOT, 'memories', `${M1}.md`));
    timers.advance(RESCAN_MS);
    await settle();
    expect(index.get(M1)).toBeUndefined();
    service.stop();
    expect(service.fallback).toBe(false);
    expect(timers.size).toBe(0);
  });

  it('logs failed reloads and rescans without stopping', async () => {
    const { fs, watcher, timers, logger, service } = await setup();
    const path = join(REPO_ROOT, 'memories', `${M1}.md`);
    fs.stat = async () => {
      throw new Error('stat failed');
    };
    watcher.changes.get(REPO_ROOT)?.(`memories/${M1}.md`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    fs.readDir = async () => {
      throw new Error('scan failed');
    };
    await Promise.all([service.rescan(), service.rescan()]);
    expect(logger.events.map((e) => e.event)).toEqual(['watcher.reload_failed', 'watcher.rescan_failed']);
    expect(path).toContain(M1);
  });

  it('stops watches and pending reloads', async () => {
    const { watcher, timers, service } = await setup();
    watcher.changes.get(REPO_ROOT)?.(`memories/${M1}.md`);
    service.stop();
    expect(timers.size).toBe(0);
    expect(watcher.stopped).toEqual([GLOBAL_ROOT, REPO_ROOT]);
  });
});
