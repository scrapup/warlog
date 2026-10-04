/**
 * Keeps the view current while the MCP server runs (plan §3.7, WL-06): file events are debounced
 * per path (150 ms) and applied to the index; on a watcher failure the service falls back to a
 * full rescan every 5 s, swapped into the index atomically.
 */
import { basename, join } from 'node:path';
import { errorFields } from '../errors/error-fields.ts';
import type { Logger } from '../ports/logger.port.ts';
import type { Watcher } from '../ports/watcher.port.ts';
import { classifyFileName } from '../security/file-name-classifier.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import type { IndexBuilder } from './index-builder.ts';
import type { StoreIndex } from './store-index.ts';

/** Timer functions (injected for tests). */
export interface Timers {
  /**
   * Schedules a call.
   * @param fn - Callback.
   * @param ms - Delay.
   * @returns A handle.
   */
  setTimeout(fn: () => void, ms: number): unknown;
  /**
   * Cancels a scheduled call.
   * @param handle - Handle.
   */
  clearTimeout(handle: unknown): void;
  /**
   * Schedules a repeated call.
   * @param fn - Callback.
   * @param ms - Period.
   * @returns A handle.
   */
  setInterval(fn: () => void, ms: number): unknown;
  /**
   * Cancels a repeated call.
   * @param handle - Handle.
   */
  clearInterval(handle: unknown): void;
}

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
  /** Logger. */
  readonly logger: Logger;
  /** Timers. */
  readonly timers: Timers;
}

/** Debounce of file events, per path. */
export const DEBOUNCE_MS = 150;
/** Period of the fallback rescan. */
export const RESCAN_MS = 5_000;

/** Applies file changes to the index. */
export class WatcherService {
  /** Collaborators. */
  private readonly deps: WatcherServiceDeps;
  /** Pending debounced reloads by path. */
  private readonly pending = new Map<string, unknown>();
  /** Running watches. */
  private stops: (() => void)[] = [];
  /** Fallback rescan timer, when active. */
  private rescanTimer: unknown;
  /** Whether a rescan is running. */
  private rescanning = false;

  /**
   * Creates the service.
   * @param deps - Collaborators.
   */
  constructor(deps: WatcherServiceDeps) {
    this.deps = deps;
  }

  /**
   * Whether the service runs in rescan mode.
   * @returns `true` after a watcher failure.
   */
  get fallback(): boolean {
    return this.rescanTimer !== undefined;
  }

  /** Starts watching both roots. */
  start(): void {
    const { global, repository } = this.deps.roots;
    for (const dir of [global, ...(repository === undefined ? [] : [repository.root])]) {
      this.stops.push(this.deps.watcher.watch(dir, (relative) => this.onChange(dir, relative), (error) => this.onError(error)));
    }
  }

  /** Stops watches, pending reloads and rescans. */
  stop(): void {
    this.stops.forEach((stop) => stop());
    this.stops = [];
    this.pending.forEach((handle) => this.deps.timers.clearTimeout(handle));
    this.pending.clear();
    if (this.rescanTimer !== undefined) {
      this.deps.timers.clearInterval(this.rescanTimer);
      this.rescanTimer = undefined;
    }
  }

  /**
   * Runs one full rescan and swaps it into the index.
   * @returns When done (a rescan already running is not repeated).
   */
  async rescan(): Promise<void> {
    if (this.rescanning) {
      return;
    }
    this.rescanning = true;
    try {
      const { index } = await this.deps.builder.build(this.deps.roots);
      this.deps.index.replaceWith(index);
    } catch (error: unknown) {
      this.deps.logger.log('warn', 'watcher.rescan_failed', { ...errorFields(error) });
    } finally {
      this.rescanning = false;
    }
  }

  /**
   * Debounces a change of one path (temp files are ignored; an unknown path triggers a rescan).
   * @param dir - Watched root.
   * @param relative - Changed path relative to the root.
   */
  private onChange(dir: string, relative: string): void {
    if (relative !== '' && classifyFileName(basename(relative)) === 'temp') {
      return;
    }
    const path = relative === '' ? dir : join(dir, ...relative.split('/'));
    const previous = this.pending.get(path);
    if (previous !== undefined) {
      this.deps.timers.clearTimeout(previous);
    }
    const handle = this.deps.timers.setTimeout(() => {
      this.pending.delete(path);
      void this.apply(path, relative === '');
    }, DEBOUNCE_MS);
    this.pending.set(path, handle);
  }

  /**
   * Applies one debounced change.
   * @param path - Changed path.
   * @param unknown - Whether the watcher did not name the file.
   * @returns When applied.
   */
  private async apply(path: string, unknown: boolean): Promise<void> {
    if (unknown) {
      await this.rescan();
      return;
    }
    try {
      await this.deps.builder.reload(this.deps.index, this.deps.roots, path);
    } catch (error: unknown) {
      this.deps.logger.log('warn', 'watcher.reload_failed', { ...errorFields(error) });
    }
  }

  /**
   * Switches to periodic rescans after a watcher failure.
   * @param error - Watcher error.
   */
  private onError(error: Error): void {
    if (this.rescanTimer !== undefined) {
      return;
    }
    this.deps.logger.log('warn', 'watcher.fallback', { ...errorFields(error) });
    this.stops.forEach((stop) => stop());
    this.stops = [];
    this.rescanTimer = this.deps.timers.setInterval(() => void this.rescan(), RESCAN_MS);
  }
}
