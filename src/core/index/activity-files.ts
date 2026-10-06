/**
 * Lists the activity files of a store root (`activity/<machine>/<yyyy-mm-dd>.jsonl`). A store comes
 * from a clone or a sync and is not trusted: a directory that is a link, or a file standing where
 * a directory belongs, is skipped instead of followed or thrown on, so one planted entry cannot
 * make the index unreadable or reach outside the root (WL-43, WL-49).
 */
import type { FileSystem } from '../ports/file-system.port.ts';

/**
 * Names in a real directory (never through a link); an unusable entry gives no names.
 * @param fs - File system.
 * @param dir - Directory path.
 * @returns The names, or `[]` when `dir` is not a plain directory or cannot be listed.
 */
async function namesIn(fs: FileSystem, dir: string): Promise<string[]> {
  const stat = await fs.lstat(dir).catch(() => undefined);
  if (stat?.isDirectory !== true || stat.isSymbolicLink) {
    return [];
  }
  return fs.readDir(dir).catch(() => []);
}

/**
 * Lists the activity files of a root from a day on.
 * @param fs - File system.
 * @param root - Store root.
 * @param sinceDay - First day kept (`yyyy-mm-dd`, `''` = all).
 * @returns Absolute file paths.
 */
export async function activityFilesSince(fs: FileSystem, root: string, sinceDay: string): Promise<string[]> {
  const dir = `${root}/activity`;
  const machines = await namesIn(fs, dir);
  const perMachine = await Promise.all(machines.map(async (machine) => (await namesIn(fs, `${dir}/${machine}`)).filter((f) => f.endsWith('.jsonl') && f.slice(0, 10) >= sinceDay).map((f) => `${dir}/${machine}/${f}`)));
  return perMachine.flat();
}
