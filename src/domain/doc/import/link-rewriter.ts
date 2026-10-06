/**
 * Image link rewriting (WL-61, WL-63): only the destination of each image changes, so the stored
 * Markdown is byte-identical to the source otherwise (and the reverse rewrite on export restores
 * the original destinations).
 */

/** A destination to replace. */
export interface Replacement {
  /** Offset of the first character of the destination (UTF-16 index). */
  readonly start: number;
  /** Offset after the last character. */
  readonly end: number;
  /** New destination text. */
  readonly text: string;
}

/**
 * Applies replacements to a text.
 * @param text - Source text.
 * @param replacements - Non-overlapping replacements, in any order.
 * @returns The text with every destination replaced.
 */
export function applyReplacements(text: string, replacements: readonly Replacement[]): string {
  const ordered = [...replacements].sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const r of ordered) {
    out += text.slice(at, r.start) + r.text;
    at = r.end;
  }
  return out + text.slice(at);
}

/**
 * Percent-encodes the segments of an asset path for use in a Markdown destination.
 * @param path - `/`-separated relative path.
 * @returns The encoded path.
 */
export function encodeDestination(path: string): string {
  return path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

/**
 * Stored destination of an asset.
 * @param kind - Document kind (assets live under `assets/<kind>/`).
 * @param path - Asset path relative to the source folder.
 * @returns The destination to write into the stored Markdown.
 */
export function storedDestination(kind: string, path: string): string {
  return `assets/${kind}/${encodeDestination(path)}`;
}
