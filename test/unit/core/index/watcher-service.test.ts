import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { IndexBuilder } from '../../../../src/core/index/index-builder.ts';
import { BURST_LIMIT, DEBOUNCE_MS, RESCAN_MS, WatcherService } from '../../../../src/core/index/watcher-service.ts';
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
const P = '01J00000000000000000000P01';

/** Watcher driven by the test. */
class FakeWatcher implements Watcher {
  /** Change callbacks by root. */
  readonly changes = new Map<string, (relative: string) => void>();
  /** Error callbacks by root. */
  readonly errors = new Map<string, (error: Error) => void>();
  /** Watch calls by root. */
  readonly armed: string[] = [];
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
    this.armed.push(root);
    this.changes.set(root, onChange);
    this.errors.set(root, onError);
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
 * @returns After the queue drains.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
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
  const service = new WatcherService({ watcher, builder, index, roots: ROOTS, logger, timers, clock: new FixedClock() });
  service.start();
  return { fs, index, watcher, timers, logger, service, repo: (rel: string) => watcher.changes.get(REPO_ROOT)?.(rel) };
}

describe('WatcherService events', () => {
  it('[WL-06] applies an external change once after the debounce', async () => {
    const { fs, index, timers, repo } = await setup();
    fs.files.set(join(REPO_ROOT, 'memories', `${M2}.md`), memory(M2, 'two'));
    repo(`memories/${M2}.md`);
    repo(`memories/${M2}.md`);
    timers.advance(DEBOUNCE_MS - 1);
    await settle();
    expect(index.get(M2)).toBeUndefined();
    timers.advance(1);
    await settle();
    expect(index.get(M2)?.record.data['title']).toBe('two');
    expect(timers.size).toBe(0);
  });

  it('[WL-45] keeps temp files current: created, then removed by hand', async () => {
    const { fs, index, timers, repo } = await setup();
    const temp = join(REPO_ROOT, 'memories', `.${M1}.md.tmp-1-x`);
    fs.files.set(temp, 'partial');
    repo(`memories/.${M1}.md.tmp-1-x`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(index.excluded.tempFiles().map((t) => t.path)).toEqual([temp]);
    fs.files.delete(temp);
    repo(`memories/.${M1}.md.tmp-1-x`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(index.excluded.tempFiles()).toEqual([]);
  });

  it('[WL-06] indexes every file of a directory moved into the root', async () => {
    const { fs, index, timers, repo } = await setup();
    fs.files.set(join(REPO_ROOT, 'projects', P, 'project.md'), stringifyFrontMatter({ data: { id: P, type: 'project', rev: 1, created_at: 'x', updated_at: 'x', machine: 'm' }, body: '' }));
    repo(`projects/${P}`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(index.get(P)?.type).toBe('project');
  });

  it('ignores events of skipped areas', async () => {
    const { timers, repo } = await setup();
    repo('activity/m-aaaaaaaa/2026-10-03.jsonl');
    repo('docs/epic/spec.md');
    expect(timers.size).toBe(0);
  });

  it('rescans when the watcher cannot name the file', async () => {
    const { fs, index, watcher, timers } = await setup();
    fs.files.set(join(GLOBAL_ROOT, 'global', 'memories', `${M2}.md`), memory(M2, 'g'));
    watcher.changes.get(GLOBAL_ROOT)?.('');
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(index.get(M2)?.scope).toBe('global');
  });

  it('collapses a burst of changes into one rescan', async () => {
    const { fs, index, timers, repo, logger } = await setup();
    fs.files.set(join(REPO_ROOT, 'memories', `${M2}.md`), memory(M2, 'burst'));
    for (let i = 0; i < BURST_LIMIT + 10; i += 1) {
      repo(`memories/01J00000000000000000000B${String(i).padStart(2, '0')}.md`);
    }
    repo(`memories/${M2}.md`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(index.get(M2)?.record.data['title']).toBe('burst');
    expect(logger.events.map((e) => e.event)).toContain('index.built');
  });
});

describe('WatcherService fallback', () => {
  it('[WL-06] covers only the failed root by rescans, logs once, re-arms and recovers', async () => {
    const { fs, index, watcher, timers, logger, service, repo } = await setup();
    watcher.errors.get(REPO_ROOT)?.(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect(service.fallback).toBe(true);
    expect(watcher.stopped).toEqual([REPO_ROOT]);
    expect(logger.events).toEqual([{ level: 'warn', event: 'watcher.fallback', fields: { root_kind: 'repo', error_code: 'UNEXPECTED', error_name: 'Error', sys_code: 'ENOENT' } }]);
    fs.files.delete(join(REPO_ROOT, 'memories', `${M1}.md`));
    timers.advance(RESCAN_MS);
    await settle();
    expect(index.get(M1)).toBeUndefined();
    expect(watcher.armed.filter((r) => r === REPO_ROOT)).toHaveLength(2);
    watcher.errors.get(REPO_ROOT)?.(new Error('still missing'));
    expect(logger.events.filter((e) => e.event === 'watcher.fallback')).toHaveLength(1);
    timers.advance(RESCAN_MS);
    await settle();
    timers.advance(RESCAN_MS);
    await settle();
    expect(service.fallback).toBe(false);
    expect(logger.events.map((e) => e.event)).toContain('watcher.recovered');
    fs.files.set(join(REPO_ROOT, 'memories', `${M2}.md`), memory(M2, 'after'));
    repo(`memories/${M2}.md`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(index.get(M2)?.record.data['title']).toBe('after');
  });

  it('logs the first failed rescan and the recovery, and keeps applying changes', async () => {
    const { fs, index, logger, service, timers, repo } = await setup();
    const realReadDir = fs.readDir.bind(fs);
    fs.readDir = async () => {
      throw new Error('scan failed');
    };
    await service.rescan();
    await service.rescan();
    await service.rescan();
    fs.readDir = realReadDir;
    await service.rescan();
    expect(logger.events.map((e) => [e.event, e.fields['failures']])).toEqual([
      ['watcher.rescan_failed', 1],
      ['watcher.rescan_failed', 2],
      ['index.built', undefined],
      ['watcher.rescan_recovered', 3],
    ]);
    fs.lstat = async () => {
      throw new Error('lstat failed');
    };
    repo(`memories/${M1}.md`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(logger.events.at(-1)?.event).toBe('watcher.reload_failed');
    expect(index.get(M1)).toBeDefined();
  });

  it('[WL-06] reloads a path changed again while its reload runs: never two at once for the same path, one more afterwards', async () => {
    const { fs, index, timers, repo } = await setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const realLstat = fs.lstat.bind(fs);
    const target = join(REPO_ROOT, 'memories', `${M2}.md`);
    let started = 0;
    let inFlight = 0;
    let peak = 0;
    fs.lstat = async (path) => {
      if (path !== target) {
        return realLstat(path);
      }
      started += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        if (started === 1) {
          await gate;
        }
        return await realLstat(path);
      } finally {
        inFlight -= 1;
      }
    };
    fs.files.set(target, memory(M2, 'v1'));
    repo(`memories/${M2}.md`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    fs.files.set(target, memory(M2, 'v2'));
    repo(`memories/${M2}.md`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    expect(started).toBe(1);
    release();
    await settle();
    expect(peak).toBe(1);
    expect(started).toBeGreaterThan(1);
    expect(index.get(M2)?.record.data['title']).toBe('v2');
  });

  it('[WL-06] a rescan requested while another builds is not dropped: one more runs on a newer view', async () => {
    const { fs, index, service } = await setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const realReadDir = fs.readDir.bind(fs);
    let builds = 0;
    fs.readDir = async (path, options) => {
      if (path === GLOBAL_ROOT) {
        builds += 1;
        if (builds === 1) {
          await gate;
        }
      }
      return realReadDir(path, options);
    };
    const first = service.rescan();
    await settle();
    fs.files.set(join(REPO_ROOT, 'memories', `${M2}.md`), memory(M2, 'late'));
    void service.rescan();
    release();
    await first;
    await settle();
    expect(builds).toBe(2);
    expect(index.get(M2)?.record.data['title']).toBe('late');
  });

  it('[WL-06] a reload applied while a rescan builds schedules one more rescan, so the older snapshot cannot hide it', async () => {
    const { fs, index, timers, repo, service } = await setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const realReadDir = fs.readDir.bind(fs);
    let builds = 0;
    fs.readDir = async (path, options) => {
      if (path === GLOBAL_ROOT) {
        builds += 1;
        if (builds === 1) {
          await gate;
        }
      }
      return realReadDir(path, options);
    };
    const rescan = service.rescan();
    await settle();
    fs.files.set(join(REPO_ROOT, 'memories', `${M2}.md`), memory(M2, 'during'));
    repo(`memories/${M2}.md`);
    timers.advance(DEBOUNCE_MS);
    await settle();
    release();
    await rescan;
    await settle();
    expect(builds).toBe(2);
    expect(index.get(M2)?.record.data['title']).toBe('during');
  });

  it('[WL-06] a rescan that finishes after stop() leaves the index and the follow-up alone', async () => {
    const { fs, index, service } = await setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const realReadDir = fs.readDir.bind(fs);
    fs.readDir = async (path, options) => {
      if (path === GLOBAL_ROOT) {
        await gate;
      }
      return realReadDir(path, options);
    };
    fs.files.set(join(REPO_ROOT, 'memories', `${M2}.md`), memory(M2, 'late'));
    const rescan = service.rescan();
    await settle();
    void service.rescan();
    service.stop();
    release();
    await rescan;
    await settle();
    expect(index.get(M2)).toBeUndefined();
  });

  it('stops scheduling rescans when stopped during a fallback cycle', async () => {
    const { fs, watcher, timers, service } = await setup();
    watcher.errors.get(REPO_ROOT)?.(new Error('x'));
    const realReadDir = fs.readDir.bind(fs);
    fs.readDir = async (path, options) => {
      service.stop();
      return realReadDir(path, options);
    };
    timers.advance(RESCAN_MS);
    await settle();
    expect(timers.size).toBe(0);
    expect(watcher.armed.filter((r) => r === REPO_ROOT)).toHaveLength(1);
  });

  it('stops watches, pending reloads and rescans', async () => {
    const { watcher, timers, service, repo } = await setup();
    repo(`memories/${M1}.md`);
    watcher.errors.get(GLOBAL_ROOT)?.(new Error('x'));
    service.stop();
    expect(timers.size).toBe(0);
    expect(watcher.stopped).toEqual([GLOBAL_ROOT, REPO_ROOT]);
    watcher.errors.get(REPO_ROOT)?.(new Error('late'));
    expect(service.fallback).toBe(false);
  });
});
