/**
 * In-memory {@link FileSystem} fake for unit tests. Paths are normalized to `/`.
 */
import { WarlogError } from '../../../src/core/errors/warlog-error.ts';
import type { FileStat, FileSystem, ReadDirOptions, ReleaseLock } from '../../../src/core/ports/file-system.port.ts';

/**
 * Normalizes a path to forward slashes without a trailing slash.
 * @param path - Raw path.
 * @returns Normalized path.
 */
export function norm(path: string): string {
  const p = path.split('\\').join('/');
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** In-memory file system with optional failure injection. */
export class MemoryFileSystem implements FileSystem {
  /** Files by normalized path. */
  readonly files = new Map<string, string>();
  /** Explicit directories. */
  readonly dirs = new Set<string>();
  /** Symbolic links: link path → target path. */
  readonly links = new Map<string, string>();
  /** Held locks. */
  readonly locks = new Set<string>();
  /** Modification times by path. */
  readonly mtimes = new Map<string, number>();
  /** Paths whose atomic write fails (simulated crash before rename). */
  readonly failWrites = new Set<string>();
  /** Paths whose append fails. */
  readonly failAppends = new Set<string>();
  /** Number of `readDir` calls (to assert point loading). */
  readDirCalls = 0;

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
    for (const key of [...this.files.keys(), ...this.dirs]) {
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
    return [...out].sort();
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
      return { isDirectory: false, size: Buffer.byteLength(content), mtimeMs: this.mtimes.get(p) ?? 0 };
    }
    const isDir = this.dirs.has(p) || [...this.files.keys()].some((k) => k.startsWith(`${p}/`));
    return isDir ? { isDirectory: true, size: 0, mtimeMs: 0 } : undefined;
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
