/**
 * In-memory {@link FileSystem} fake for unit tests. Paths are normalized to `/`.
 */
import { WarlogError } from '../../../src/core/errors/warlog-error.ts';
import { compareCodeUnits } from '../../../src/core/security/compare.ts';
import type { FileStat, FileSystem, ReadDirOptions, ReleaseLock, TreeEntry } from '../../../src/core/ports/file-system.port.ts';
import { PathMap, norm } from './path-map.ts';
import { PathSet } from './path-set.ts';

export { norm } from './path-map.ts';

/** In-memory file system with optional failure injection. */
export class MemoryFileSystem implements FileSystem {
  /** Files by normalized path. */
  readonly files = new PathMap<string>();
  /** Explicit directories. */
  readonly dirs = new PathSet();
  /** Symbolic links: link path → target path. */
  readonly links = new PathMap<string>();
  /** Held locks. */
  readonly locks = new PathSet();
  /** Modification times by path. */
  readonly mtimes = new PathMap<number>();
  /** Paths whose atomic write fails (simulated crash before rename). */
  readonly failWrites = new PathSet();
  /** Paths whose append fails. */
  readonly failAppends = new PathSet();
  /** Number of `readDir` calls (to assert point loading). */
  readDirCalls = 0;
  /** Paths whose reads fail with `EACCES`. */
  failReads = new PathSet();

  /**
   * Seeds files.
   * @param files - Content by path.
   */
  constructor(files: Record<string, string> = {}) {
    for (const [p, c] of Object.entries(files)) {
      this.files.set(norm(p), c);
    }
  }

  /**
   * Reads a file.
   * @param path - Path.
   * @returns Content.
   */
  async readFile(path: string): Promise<string> {
    if (this.failReads.has(this.resolve(path))) {
      throw Object.assign(new Error(`EACCES: ${path}`), { code: 'EACCES' });
    }
    const content = this.files.get(this.resolve(path));
    if (content === undefined) {
      throw new WarlogError('NOT_FOUND', `${path} not found`, { path });
    }
    return content;
  }

  /**
   * Writes a file atomically (or fails, leaving the previous content).
   * @param path - Path.
   * @param data - Content.
   * @returns Resolved when written.
   */
  async writeFileAtomic(path: string, data: string): Promise<void> {
    const p = this.resolve(path);
    if (this.failWrites.has(p)) {
      throw new WarlogError('INTERNAL', `cannot replace ${path}`, { path });
    }
    this.files.set(p, data);
    this.mtimes.set(p, Date.now());
  }

  /**
   * Appends to a file.
   * @param path - Path.
   * @param data - Text.
   * @returns Resolved when appended.
   */
  async appendFile(path: string, data: string): Promise<void> {
    const p = this.resolve(path);
    if (this.failAppends.has(p)) {
      throw new Error(`EIO ${path}`);
    }
    this.files.set(p, (this.files.get(p) ?? '') + data);
  }

  /**
   * Lists a directory.
   * @param path - Directory.
   * @param options - Listing options.
   * @returns Names or relative paths.
   */
  async readDir(path: string, options: ReadDirOptions = {}): Promise<string[]> {
    this.readDirCalls += 1;
    const prefix = `${this.resolve(path)}/`;
    const out = new Set<string>();
    for (const key of [...this.files.keys(), ...this.dirs, ...this.links.keys()]) {
      if (key.startsWith(prefix)) {
        const rel = key.slice(prefix.length);
        if (options.recursive === true) {
          const parts = rel.split('/');
          parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join('/')));
        } else {
          out.add(rel.split('/')[0] ?? rel);
        }
      }
    }
    return [...out].sort(compareCodeUnits);
  }

  /**
   * Reads metadata.
   * @param path - Path.
   * @returns Metadata or `undefined`.
   */
  async stat(path: string): Promise<FileStat | undefined> {
    const p = this.resolve(path);
    const content = this.files.get(p);
    if (content !== undefined) {
      return { isDirectory: false, isFile: true, isSymbolicLink: false, size: Buffer.byteLength(content), mtimeMs: this.mtimes.get(p) ?? 0 };
    }
    const isDir = this.dirs.has(p) || [...this.files.keys()].some((k) => k.startsWith(`${p}/`));
    return isDir ? { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, mtimeMs: 0 } : undefined;
  }

  /**
   * Lists every descendant with its kind.
   * @param path - Directory.
   * @returns Entries.
   */
  async listTree(path: string): Promise<TreeEntry[]> {
    const names = await this.readDir(path, { recursive: true });
    const base = this.resolve(path);
    return names.map((relative) => {
      const full = `${norm(path)}/${relative}`;
      if (this.links.has(full)) {
        return { relative, kind: 'symlink' as const };
      }
      return { relative, kind: this.files.has(`${base}/${relative}`) ? ('file' as const) : ('directory' as const) };
    });
  }

  /**
   * Reads a file within a size limit; a link is refused (`ELOOP`, as with `O_NOFOLLOW`).
   * @param path - Path.
   * @param maxBytes - Limit.
   * @returns Content, or `undefined` above the limit.
   */
  async readFileBounded(path: string, maxBytes: number): Promise<string | undefined> {
    if (this.links.has(path)) {
      throw Object.assign(new Error(`ELOOP: ${path}`), { code: 'ELOOP' });
    }
    const text = await this.readFile(path);
    return Buffer.byteLength(text) > maxBytes ? undefined : text;
  }

  /**
   * Reads metadata without following a final link (a path in {@link links} is a link).
   * @param path - Path.
   * @returns Metadata or `undefined`.
   */
  async lstat(path: string): Promise<FileStat | undefined> {
    if (this.links.has(norm(path))) {
      return { isDirectory: false, isFile: false, isSymbolicLink: true, size: 0, mtimeMs: 0 };
    }
    return this.stat(path);
  }

  /**
   * Creates a directory.
   * @param path - Directory.
   * @returns Resolved when created.
   */
  async mkdirp(path: string): Promise<void> {
    this.dirs.add(this.resolve(path));
  }

  /**
   * Resolves symbolic links.
   * @param path - Path.
   * @returns Canonical path.
   */
  async realpath(path: string): Promise<string> {
    const p = this.resolve(path);
    if ((await this.stat(p)) === undefined) {
      throw new WarlogError('NOT_FOUND', `${path} not found`, { path });
    }
    return p;
  }

  /**
   * Removes an entry tree.
   * @param path - Path.
   * @returns Resolved when removed.
   */
  async remove(path: string): Promise<void> {
    const p = this.resolve(path);
    for (const key of [...this.files.keys()]) {
      if (key === p || key.startsWith(`${p}/`)) {
        this.files.delete(key);
      }
    }
    this.dirs.delete(p);
  }

  /**
   * Acquires a lock (fails immediately when held).
   * @param path - Guarded path.
   * @returns Release function.
   */
  async lock(path: string): Promise<ReleaseLock> {
    const p = this.resolve(path);
    if (this.locks.has(p)) {
      throw new WarlogError('CONFLICT', `${path} is locked by another writer`, { reason: 'locked' });
    }
    this.locks.add(p);
    return async () => {
      this.locks.delete(p);
    };
  }

  /**
   * Applies symbolic links to a path (longest prefix first).
   * @param path - Raw path.
   * @returns The resolved normalized path.
   */
  private resolve(path: string): string {
    let p = norm(path);
    for (const [link, target] of this.links) {
      if (p === link || p.startsWith(`${link}/`)) {
        p = norm(target) + p.slice(link.length);
      }
    }
    return p;
  }
}
