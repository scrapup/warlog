/**
 * Classification of store file names (WL-43): sync-service conflict copies and warlog
 * temporary files are excluded from the view. String operations only (WL-48).
 */

/** Classification of a file name. */
export type FileNameClass = 'entity' | 'conflict_copy' | 'temp';

/**
 * Tells whether a base name is an iCloud duplicate (`name 2.md`).
 * @param name - Base name.
 * @returns `true` when a space and digits precede the extension.
 */
function isICloudCopy(name: string): boolean {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const space = stem.lastIndexOf(' ');
  if (space < 1 || space === stem.length - 1) {
    return false;
  }
  return [...stem.slice(space + 1)].every((ch) => ch >= '0' && ch <= '9');
}

/**
 * Classifies a file base name.
 * @param name - Base name (no directory).
 * @returns `temp` for `.<name>.tmp-…`, `conflict_copy` for Dropbox, Syncthing and iCloud copies, `entity` otherwise.
 */
export function classifyFileName(name: string): FileNameClass {
  if (name.startsWith('.') && name.includes('.tmp-')) {
    return 'temp';
  }
  if (name.includes('(conflicted copy') || name.includes('.sync-conflict-') || isICloudCopy(name)) {
    return 'conflict_copy';
  }
  return 'entity';
}
