/**
 * Collects the images a document references, with their diagram sources (WL-61, WL-62, WL-65,
 * WL-69): every destination must be a relative path that resolves, through real paths, to a
 * regular file inside the source folder tree, at most 10 MB. Remote, absolute and `data:`
 * destinations are rejected; nothing is downloaded. A `.puml` beside an image is collected too.
 */
import { posix, relative, resolve, sep } from 'node:path';
import type { FileSystem } from '../../../core/ports/file-system.port.ts';
import { isInside } from '../../../core/security/path-guard.ts';
import { sha256Hex } from '../../../core/security/sha256.ts';
import type { ImageLink } from '../markdown-scanner.ts';
import { storedDestination } from './link-rewriter.ts';
import type { Replacement } from './link-rewriter.ts';

/** Largest image or diagram source. */
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/** An asset ready to be stored. */
export interface CollectedAsset {
  /** Path relative to the source folder, `/`-separated. */
  readonly path: string;
  /** Content. */
  readonly bytes: Uint8Array;
  /** SHA-256 of the content. */
  readonly sha256: string;
}

/** What collecting the images of one document gave. */
export interface CollectResult {
  /** Assets (deduplicated by path). */
  readonly assets: CollectedAsset[];
  /** Destination rewrites for the stored Markdown. */
  readonly replacements: Replacement[];
  /** Problems found (empty when every image is usable). */
  readonly problems: string[];
}

/** Where images are resolved. */
export interface CollectScope {
  /** Document kind (assets are stored under `assets/<kind>/`). */
  readonly kind: string;
  /** Real path of the source folder tree. */
  readonly root: string;
  /** Folder of the document being read. */
  readonly docDir: string;
}

/**
 * Percent-decodes a destination; malformed escapes leave it as written.
 * @param dest - Destination.
 * @returns The decoded text.
 */
function decode(dest: string): string {
  try {
    return decodeURIComponent(dest);
  } catch {
    return dest;
  }
}

/**
 * Tells whether a character can continue a URI scheme.
 * @param ch - One character.
 * @returns `true` for letters, digits, `+`, `-` and `.`.
 */
function isSchemeChar(ch: string): boolean {
  const c = ch.toLowerCase();
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '+' || c === '-' || c === '.';
}

/**
 * Tells whether a destination starts with a URI scheme (`http:`, `data:`, `C:`…).
 * @param dest - Destination.
 * @returns `true` when it has a scheme.
 */
function hasScheme(dest: string): boolean {
  const first = dest.charAt(0).toLowerCase();
  if (!(first >= 'a' && first <= 'z')) {
    return false;
  }
  let i = 1;
  while (i < dest.length && isSchemeChar(dest.charAt(i))) {
    i += 1;
  }
  return dest.charAt(i) === ':';
}

/**
 * Cuts a destination before its query or fragment.
 * @param dest - Decoded destination.
 * @returns The path part.
 */
function pathPart(dest: string): string {
  const cut = [dest.indexOf('?'), dest.indexOf('#')].filter((i) => i >= 0);
  return cut.length === 0 ? dest : dest.slice(0, Math.min(...cut));
}

/**
 * Why a destination is not allowed, from its text alone.
 * @param dest - Destination as written.
 * @returns A message, or `undefined` when acceptable.
 */
function textProblem(dest: string): string | undefined {
  const decoded = pathPart(decode(dest));
  const normal = posix.normalize(decoded);
  if (decoded === '') {
    return 'empty image destination';
  }
  if (hasScheme(decoded)) {
    return 'remote or absolute image destinations are not allowed (nothing is downloaded)';
  }
  if (decoded.startsWith('/') || decoded.includes('\\')) {
    return 'image destination must be a relative path with "/" separators';
  }
  return normal === '..' || normal.startsWith('../') ? 'image destination leaves the document folder tree' : undefined;
}

/** Collects the assets of one document. */
export class AssetCollector {
  /** File system. */
  private readonly fs: FileSystem;

  /**
   * Creates the collector.
   * @param fs - File system.
   */
  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  /**
   * Resolves one file to a collected asset.
   * @param scope - Where images are resolved.
   * @param path - Normalized relative path.
   * @param label - Prefix for problem messages.
   * @returns The asset, or a problem message.
   */
  private async read(scope: CollectScope, path: string, label: string): Promise<CollectedAsset | string> {
    const abs = resolve(scope.docDir, ...path.split('/'));
    let real: string;
    try {
      real = await this.fs.realpath(abs);
    } catch {
      return `${label}: ${path} does not exist`;
    }
    if (!isInside(scope.root, real)) {
      return `${label}: ${path} resolves outside the document folder tree`;
    }
    if ((await this.fs.stat(real))?.isFile !== true) {
      return `${label}: ${path} is not a file`;
    }
    const bytes = await this.fs.readBinary(real, MAX_ASSET_BYTES);
    return bytes === undefined ? `${label}: ${path} is larger than 10 MB` : { path, bytes, sha256: sha256Hex(bytes) };
  }

  /**
   * Path of the diagram source beside an image (`x.png` → `x.puml`), when it is not one itself.
   * @param path - Image path.
   * @returns The sibling path.
   */
  private sibling(path: string): string | undefined {
    const ext = posix.extname(path);
    return ext === '' || ext.toLowerCase() === '.puml' ? undefined : `${path.slice(0, -ext.length)}.puml`;
  }

  /**
   * Collects every image of a document.
   * @param scope - Where images are resolved.
   * @param images - Image links found by the scanner.
   * @returns Assets, rewrites and problems.
   */
  async collect(scope: CollectScope, images: readonly ImageLink[]): Promise<CollectResult> {
    const assets = new Map<string, CollectedAsset>();
    const replacements: Replacement[] = [];
    const problems: string[] = [];
    for (const image of images) {
      const label = `line ${image.line}`;
      const bad = textProblem(image.dest);
      if (bad !== undefined) {
        problems.push(`${label}: ${bad}`);
        continue;
      }
      const path = posix.normalize(pathPart(decode(image.dest)));
      const found = assets.get(path) ?? (await this.read(scope, path, label));
      if (typeof found === 'string') {
        problems.push(found);
        continue;
      }
      assets.set(path, found);
      replacements.push({ start: image.destStart, end: image.destEnd, text: storedDestination(scope.kind, path) });
      await this.addSource(scope, path, assets, problems);
    }
    return { assets: [...assets.values()], replacements, problems };
  }

  /**
   * Adds the diagram source beside an image when there is one.
   * @param scope - Where images are resolved.
   * @param path - Image path.
   * @param assets - Assets collected so far (updated).
   * @param problems - Problems so far (updated).
   * @returns When done.
   */
  private async addSource(scope: CollectScope, path: string, assets: Map<string, CollectedAsset>, problems: string[]): Promise<void> {
    const source = this.sibling(path);
    if (source === undefined || assets.has(source) || (await this.fs.stat(resolve(scope.docDir, ...source.split('/'))))?.isFile !== true) {
      return;
    }
    const found = await this.read(scope, source, 'diagram source');
    if (typeof found === 'string') {
      problems.push(found);
    } else {
      assets.set(source, found);
    }
  }
}

/**
 * Relative `/`-separated path of a file below a folder.
 * @param root - Folder.
 * @param file - File inside it.
 * @returns The relative path.
 */
export function relativePosix(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}
