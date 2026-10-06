/**
 * Where documents may be read from and written to (WL-68, WL-69): the repository area reads only
 * inside the current repository working tree; the global area also reads paths below the roots
 * the User listed in the global variable `docs.import.allowed_roots`. Every path is resolved
 * through real paths first, so a symbolic link cannot lead out of an allowed root. Exports follow
 * the same rule for their destination.
 */
import { basename, dirname, join } from 'node:path';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { isInside } from '../../core/security/path-guard.ts';
import type { DocArea } from './doc.schema.ts';
import type { VarRepositoryFactory } from '../var/var.repository.ts';

/** Name of the global variable listing extra roots for the global area. */
export const ALLOWED_ROOTS_VAR = 'docs.import.allowed_roots';

/** An allowed root, as given and as resolved. */
export interface AllowedRoot {
  /** Real path. */
  readonly real: string;
  /** Where it comes from (for messages). */
  readonly origin: string;
}

/** Decides which paths a call may read and write. */
export class ImportPathPolicy {
  /** File system. */
  private readonly fs: FileSystem;
  /** Allowed roots of the call. */
  private readonly roots: readonly AllowedRoot[];

  /**
   * Creates the policy.
   * @param fs - File system.
   * @param roots - Allowed roots (real paths).
   */
  constructor(fs: FileSystem, roots: readonly AllowedRoot[]) {
    this.fs = fs;
    this.roots = roots;
  }

  /**
   * Builds the policy of a call.
   * @param fs - File system.
   * @param vars - Variable repository factory (for `docs.import.allowed_roots`).
   * @param context - Call context.
   * @param area - Area documents are registered in.
   * @returns The policy.
   */
  static async forCall(fs: FileSystem, vars: VarRepositoryFactory, context: OperationContext, area: DocArea): Promise<ImportPathPolicy> {
    const top = await context.topLevel();
    const listed = area === 'global' ? await ImportPathPolicy.listedRoots(vars, context) : [];
    const candidates = [...(top === undefined ? [] : [{ path: top, origin: 'the repository working tree' }]), ...listed.map((p) => ({ path: p, origin: ALLOWED_ROOTS_VAR }))];
    const resolved = await Promise.all(candidates.map(async (c) => ({ real: await fs.realpath(c.path).catch(() => undefined), origin: c.origin })));
    return new ImportPathPolicy(fs, resolved.filter((r): r is AllowedRoot => r.real !== undefined));
  }

  /**
   * Roots listed in the global variable (absolute paths only).
   * @param vars - Variable repository factory.
   * @param context - Call context.
   * @returns The listed paths.
   */
  private static async listedRoots(vars: VarRepositoryFactory, context: OperationContext): Promise<string[]> {
    const record = await vars({ roots: context.roots, clock: context.clock, machine: context.machine }).read({ scope: 'global', name: ALLOWED_ROOTS_VAR });
    return Array.isArray(record?.value) ? record.value.filter((v): v is string => typeof v === 'string' && v !== '') : [];
  }

  /**
   * Real path of a path that may not exist yet: the deepest existing ancestor, resolved, plus
   * the missing tail.
   * @param path - Path.
   * @returns The resolved path.
   */
  private async resolveEventually(path: string): Promise<string> {
    try {
      return await this.fs.realpath(path);
    } catch {
      const parent = dirname(path);
      if (parent === path) {
        return path;
      }
      const real = await this.resolveEventually(parent);
      return join(real, basename(path));
    }
  }

  /**
   * Resolves a path and checks it is inside an allowed root.
   * @param path - Path to read or write (it need not exist for a write).
   * @param verb - `read` or `write`, for the message.
   * @returns The real path.
   * @throws {WarlogError} `VALIDATION` when the path is outside every allowed root.
   */
  async resolve(path: string, verb: 'read' | 'write'): Promise<string> {
    const real = verb === 'read' ? await this.fs.realpath(path).catch(() => undefined) : await this.resolveEventually(path);
    if (real === undefined) {
      throw new WarlogError('NOT_FOUND', `${path} does not exist`, { type: 'path' });
    }
    if (!this.roots.some((r) => isInside(r.real, real))) {
      throw new WarlogError('VALIDATION', `refusing to ${verb} ${path}: it is outside ${this.roots.length === 0 ? 'any allowed location (not inside a git repository, and no docs.import.allowed_roots)' : 'the repository working tree and docs.import.allowed_roots'}`, {
        field: 'path',
        reason: 'path_not_allowed',
      });
    }
    return real;
  }

  /**
   * The allowed root containing a real path.
   * @param real - Real path.
   * @returns The root, when any.
   */
  rootOf(real: string): AllowedRoot | undefined {
    return this.roots.find((r) => isInside(r.real, real));
  }
}
