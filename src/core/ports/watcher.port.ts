/** Stops a running watch. */
export type StopWatching = () => void;

/** File watcher port (implemented by US-96). */
export interface Watcher {
  /**
   * Watches a directory tree.
   * @param root - Directory to watch recursively.
   * @param onChange - Called with the changed path (relative to `root`, `/`-separated).
   * @param onError - Called when the watcher fails (the caller falls back to rescans).
   * @returns A function stopping the watch.
   */
  watch(root: string, onChange: (relativePath: string) => void, onError: (error: Error) => void): StopWatching;
}
