/**
 * Keeps the view current while the MCP server runs (plan §3.7, WL-06). File events are debounced
 * per path (150 ms) and applied by a queue of at most {@link MAX_OPEN_FILES} reloads (one per path
 * at a time); a burst larger than {@link BURST_LIMIT} becomes one full rescan. A root whose watch
 * fails (missing, `EMFILE`, unsupported) is covered by full rescans, re-armed after each one; the
 * other root keeps its watch. Rescans are chained and spaced by at least 3× their duration.
 */
import { join } from 'node:path';
import { errorFields } from '../errors/error-fields.ts';
import type { Clock } from '../ports/clock.port.ts';
import type { Logger } from '../ports/logger.port.ts';
import type { RootKind } from '../ports/store-view.port.ts';
import type { Timers } from '../ports/timers.port.ts';
import type { StopWatching, Watcher } from '../ports/watcher.port.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import { MAX_OPEN_FILES } from './bounded.ts';
import { inSkippedArea } from './entity-reader.ts';
import { buildFields } from './index-builder.ts';
import type { IndexBuilder } from './index-builder.ts';
import type { StoreIndex } from './store-index.ts';

/** Collaborators of {@link WatcherService}. */
export interface WatcherServiceDeps {
  /** File watcher. */
  readonly watcher: Watcher;
  /** Index builder. */
  readonly builder: IndexBuilder;
  /** View kept current. */
  readonly index: StoreIndex;
  /** Store roots. */
  readonly roots: StoreRoots;
  /** Logger (codes only). */
  readonly logger: Logger;
  /** Timers. */
  readonly timers: Timers;
  /** Clock (rescan duration). */
  readonly clock: Clock;
}

/** Debounce of file events, per path. */
export const DEBOUNCE_MS = 150;
/** Minimum spacing of fallback rescans. */
export const RESCAN_MS = 5_000;
/** Pending paths above which a full rescan replaces individual reloads. */
export const BURST_LIMIT = 256;
/** Key of a pending full rescan in the debounce map. */
const RESCAN_KEY = '\u0000rescan';

/** Watch state of one root. */
interface RootWatch {
  /** Root kind. */
  readonly kind: RootKind;
  /** Directory. */
  readonly dir: string;
  /** Stops the watch, when armed. */
  stop: StopWatching | undefined;
  /** `ok`; `failed` (rescans cover it); `rearming` (re-armed, confirmed after a quiet cycle). */
  state: 'ok' | 'failed' | 'rearming';
}

/** Applies file changes to the index. */
export class WatcherService {
  /** Collaborators. */
  private readonly deps: WatcherServiceDeps;
  /** Watched roots. */
  private readonly watches: RootWatch[];
  /** Debounce timers by path. */
  private readonly debounced = new Map<string, unknown>();
  /** Paths waiting for a reload. */
  private readonly queue = new Set<string>();
  /** Paths being reloaded. */
  private readonly active = new Set<string>();
  /** Scheduled rescan, when any. */
  private rescanTimer: unknown;
  /** Whether a rescan is running. */
  private rescanning = false;
  /** A change or rescan request arrived while a rescan was building: it ran on an older view. */
  private dirty = false;
  /** Whether the service was stopped (a rescan finishing afterwards must not touch the index). */
  private halted = false;
  /** Consecutive failed rescans. */
  private failures = 0;
  /** Delay before the next fallback rescan. */
  private nextDelay = RESCAN_MS;
  /** Whether the service runs. */
  private running = false;

  /**
   * Creates the service.
   * @param deps - Collaborators.
   */
  constructor(deps: WatcherServiceDeps) {
    this.deps = deps;
    const repo = deps.roots.repository;
    this.watches = [{ kind: 'global', dir: deps.roots.global, stop: undefined, state: 'ok' }];
    if (repo !== undefined) {
      this.watches.push({ kind: 'repo', dir: repo.root, stop: undefined, state: 'ok' });
    }
  }

  /**
   * Whether some root is covered by rescans instead of a watch.
   * @returns `true` after a watch failure, until it is re-armed.
   */
  get fallback(): boolean {
    return this.watches.some((w) => w.state !== 'ok');
  }

  /** Starts watching both roots. */
  start(): void {
    this.running = true;
    this.halted = false;
    this.watches.forEach((w) => this.arm(w));
  }

  /** Stops watches, pending reloads and rescans. */
  stop(): void {
    this.running = false;
    this.halted = true;
    this.watches.forEach((w) => {
      w.stop?.();
      w.stop = undefined;
      w.state = 'ok';
    });
    this.debounced.forEach((handle) => this.deps.timers.clearTimeout(handle));
    this.debounced.clear();
    this.queue.clear();
    if (this.rescanTimer !== undefined) {
      this.deps.timers.clearTimeout(this.rescanTimer);
      this.rescanTimer = undefined;
    }
  }

  /**
   * Runs one full rescan and swaps it into the index. A request that arrives while one is running
   * is not lost: the snapshot being built predates it, so one more rescan follows. A rescan that
   * finishes after `stop()` leaves the index alone.
   * @returns When done.
   */
  async rescan(): Promise<void> {
    if (this.rescanning) {
      this.dirty = true;
      return;
    }
    this.rescanning = true;
    this.dirty = false;
    try {
      const { index, stats } = await this.deps.builder.build(this.deps.roots);
      if (!this.halted) {
        this.deps.index.replaceWith(index);
        this.deps.logger.log(stats.durationMs > RESCAN_MS ? 'warn' : 'debug', 'index.built', { trigger: 'rescan', ...buildFields(stats) });
      }
      if (this.failures > 0) {
        this.deps.logger.log('warn', 'watcher.rescan_recovered', { failures: this.failures });
      }
      this.failures = 0;
    } catch (error: unknown) {
      this.failures += 1;
      if ((this.failures & (this.failures - 1)) === 0) {
        this.deps.logger.log('warn', 'watcher.rescan_failed', { failures: this.failures, ...errorFields(error) });
      }
    } finally {
      this.rescanning = false;
      if (this.dirty && !this.halted) {
        void this.rescan();
      }
    }
  }

  /**
   * Arms the watch of one root.
   * @param w - Root watch.
   */
  private arm(w: RootWatch): void {
    w.stop = this.deps.watcher.watch(
      w.dir,
      (relative) => this.onChange(w, relative),
      (error) => this.onError(w, error),
    );
  }

  /**
   * Debounces a change (paths in skipped areas are ignored; an unnamed change means a rescan).
   * @param w - Root watch.
   * @param relative - Changed path relative to the root.
   */
  private onChange(w: RootWatch, relative: string): void {
    if (relative !== '' && inSkippedArea({ root: w.kind, relative, path: '' })) {
      return;
    }
    const key = relative === '' ? RESCAN_KEY : join(w.dir, ...relative.split('/'));
    const previous = this.debounced.get(key);
    if (previous !== undefined) {
      this.deps.timers.clearTimeout(previous);
    }
    this.debounced.set(
      key,
      this.deps.timers.setTimeout(() => {
        this.debounced.delete(key);
        this.enqueue(key);
      }, DEBOUNCE_MS),
    );
  }

  /**
   * Queues a reload, or collapses a burst into one rescan.
   * @param key - Absolute path or {@link RESCAN_KEY}.
   */
  private enqueue(key: string): void {
    if (key === RESCAN_KEY || this.queue.size + this.debounced.size >= BURST_LIMIT) {
      this.queue.clear();
      void this.rescan();
      return;
    }
    this.queue.add(key);
    this.drain();
  }

  /** Starts queued reloads up to the concurrency limit, never two for the same path. */
  private drain(): void {
    for (const path of [...this.queue]) {
      if (this.active.size >= MAX_OPEN_FILES) {
        return;
      }
      if (this.active.has(path)) {
        continue;
      }
      this.queue.delete(path);
      this.active.add(path);
      void this.reload(path).finally(() => {
        this.active.delete(path);
        this.drain();
      });
    }
  }

  /**
   * Applies one change to the index.
   * @param path - Changed path.
   * @returns When applied.
   */
  private async reload(path: string): Promise<void> {
    try {
      await this.deps.builder.reload(this.deps.index, this.deps.roots, path);
      this.dirty ||= this.rescanning;
    } catch (error: unknown) {
      this.deps.logger.log('warn', 'watcher.reload_failed', { ...errorFields(error) });
    }
  }

  /**
   * Covers a failed root by rescans until its watch can be re-armed.
   * @param w - Root watch.
   * @param error - Watch error.
   */
  private onError(w: RootWatch, error: Error): void {
    w.stop?.();
    w.stop = undefined;
    if (!this.running) {
      return;
    }
    if (w.state === 'ok') {
      this.deps.logger.log('warn', 'watcher.fallback', { root_kind: w.kind, ...errorFields(error) });
    }
    w.state = 'failed';
    this.scheduleRescan();
  }

  /** Schedules the next fallback rescan (spaced by at least 3× the last duration). */
  private scheduleRescan(): void {
    if (this.rescanTimer !== undefined || !this.running) {
      return;
    }
    this.rescanTimer = this.deps.timers.setTimeout(() => void this.fallbackCycle(), this.nextDelay);
  }

  /**
   * One fallback cycle: rescan, re-arm failed roots, schedule again while some root still fails.
   * @returns When done.
   */
  private async fallbackCycle(): Promise<void> {
    this.rescanTimer = undefined;
    const started = this.deps.clock.now().getTime();
    await this.rescan();
    this.nextDelay = Math.max(RESCAN_MS, 3 * (this.deps.clock.now().getTime() - started));
    if (!this.running) {
      return;
    }
    for (const w of this.watches) {
      if (w.state === 'rearming') {
        w.state = 'ok';
      } else if (w.state === 'failed') {
        w.state = 'rearming';
        this.arm(w);
      }
    }
    if (this.fallback) {
      this.scheduleRescan();
    } else {
      this.deps.logger.log('warn', 'watcher.recovered', {});
    }
  }
}
