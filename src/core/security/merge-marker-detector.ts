/**
 * Detection of version-control merge conflict markers (WL-43), scanned line by line.
 */

/**
 * Tells whether a text contains the three merge-conflict marker lines in order:
 * `<<<<<<< `, `=======` and `>>>>>>> `.
 * @param text - File content.
 * @returns `true` when a conflict block is present.
 */
export function hasMergeConflictMarkers(text: string): boolean {
  let stage = 0;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (stage === 0 && line.startsWith('<<<<<<< ')) {
      stage = 1;
    } else if (stage === 1 && line === '=======') {
      stage = 2;
    } else if (stage === 2 && line.startsWith('>>>>>>> ')) {
      return true;
    }
  }
  return false;
}
