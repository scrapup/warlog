/**
 * {@link Watcher} over `fs.watch` with `recursive: true` (Linux, macOS, Windows on Node ≥ 22).
 * A failure to start (missing root, `EMFILE`, unsupported) is reported through `onError`, so the
 * caller falls back to periodic rescans.
 */
import { watch } from 'node:fs';
import { sep } from 'node:path';
import type { StopWatching, Watcher } from '../ports/watcher.port.ts';

/** Recursive watcher over the Node file system. */
export class NodeRecursiveWatcher implements Watcher {
  /**
   * Watches a directory tree.
   * @param root - Directory.
   * @param onChange - Receives the changed path relative to `root` (`/`-separated; `''` when unknown).
   * @param onError - Receives watcher failures.
   * @returns A function stopping the watch.
   */
  watch(root: string, onChange: (relativePath: string) => void, onError: (error: Error) => void): StopWatching {
    try {
      const watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
        onChange(filename === null ? '' : String(filename).split(sep).join('/'));
      });
      watcher.on('error', onError);
      return () => watcher.close();
    } catch (error: unknown) {
      queueMicrotask(() => onError(error instanceof Error ? error : new Error(String(error))));
      return () => undefined;
    }
  }
}
