/**
 * Variable files (plan §3.5): `vars/<name>.yaml` at global (`<global>/global/vars`), repository
 * (`<repo>/vars`) and project (`<repo>/projects/<id>/vars`) scope. Reads touch only the files
 * asked for (point loading, plan §3.7); writes are atomic and serialized by a lock; a deleted
 * variable keeps its file marked `deleted_at` (WL-08) and reads as absent.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { MAX_STORE_FILE_BYTES } from '../../core/index/file-loader.ts';
import type { Clock } from '../../core/ports/clock.port.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { MachineIdProvider } from '../../core/ports/machine-id.port.ts';
import { assertValid, isUlid, isVarName } from '../../core/security/identifiers.ts';
import { hasMergeConflictMarkers } from '../../core/security/merge-marker-detector.ts';
import type { PathGuard } from '../../core/security/path-guard.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';
import type { StoreRoots } from '../../core/storage/store-roots.ts';
import { parseYaml, stringifyYaml } from '../../core/storage/yaml-codec.ts';
import { assertType, isVarType } from './var-type-validator.ts';
import type { VarType } from './var-type-validator.ts';

/** Scopes a variable can live in, most specific first. */
export const VAR_SCOPES = ['project', 'repo', 'global'] as const;

/** A variable scope. */
export type VarScope = (typeof VAR_SCOPES)[number];

/** Where a variable lives. */
export interface VarLocation {
  /** Scope. */
  readonly scope: VarScope;
  /** Owning project (`project` scope). */
  readonly projectId?: string | undefined;
  /** Variable name. */
  readonly name: string;
}

/** A stored variable. */
export interface VarRecord {
  /** Name. */
  readonly name: string;
  /** Declared type. */
  readonly type: VarType;
  /** Value (matches the type). */
  readonly value: unknown;
  /** Optional restricted schema. */
  readonly schema?: Record<string, unknown>;
  /** Revision, incremented on every write. */
  readonly rev: number;
  /** Last change (ISO 8601). */
  readonly updated_at: string;
  /** Machine of the last writer. */
  readonly machine: string;
  /** Deletion time, when soft-deleted. */
  readonly deleted_at?: string;
  /** Who deleted it. */
  readonly deleted_by?: string;
}

/** What a write replaces a variable with. */
export interface VarContent {
  /** Declared type. */
  readonly type: VarType;
  /** Value. */
  readonly value: unknown;
  /** Optional schema. */
  readonly schema?: Record<string, unknown> | undefined;
}

/** Collaborators of {@link VarRepository}. */
export interface VarRepositoryDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Path guard. */
  readonly guard: PathGuard;
  /** Roots of the call. */
  readonly roots: StoreRoots;
  /** Clock. */
  readonly clock: Clock;
  /** Machine id. */
  readonly machine: MachineIdProvider;
}

/** Opens the repository of a call. */
export type VarRepositoryFactory = (request: Pick<VarRepositoryDeps, 'roots' | 'clock' | 'machine'>) => VarRepository;

/**
 * Builds the production factory.
 * @param fs - File system.
 * @param guard - Path guard.
 * @returns The factory.
 */
export function varRepositoryFactory(fs: FileSystem, guard: PathGuard): VarRepositoryFactory {
  return (request) => new VarRepository({ fs, guard, ...request });
}

/** A parsed variable file whose type and revision were checked. */
interface ValidShape extends Record<string, unknown> {
  /** Declared type. */
  type: VarType;
  /** Revision. */
  rev: number;
}

/**
 * Tells whether a parsed file has the fields a variable needs. A deletion mark must be text:
 * `deleted_at: null` or `false`, left by a hand edit, is not a readable state.
 * @param data - Parsed file.
 * @param name - Expected name.
 * @returns `true` when the shape is valid (the type is a variable type and the revision an integer).
 */
function hasVarShape(data: Record<string, unknown>, name: string): data is ValidShape {
  const deletionOk = !('deleted_at' in data) || typeof data['deleted_at'] === 'string';
  return data['name'] === name && isVarType(data['type']) && Number.isSafeInteger(data['rev']) && 'value' in data && deletionOk;
}

/**
 * Reads a record from parsed YAML, checking its shape and that the value has its declared type.
 * @param data - Parsed file.
 * @param path - File path (for errors).
 * @param name - Expected name.
 * @returns The record.
 * @throws {WarlogError} `INVALID_FILE` when the file is malformed or the value does not match its type.
 */
function toRecord(data: unknown, path: string, name: string): VarRecord {
  if (!isPlainRecord(data) || !hasVarShape(data, name)) {
    throw new WarlogError('INVALID_FILE', `variable ${name}: name, type, value or rev are invalid`, { reason: 'var_fields', file: path });
  }
  try {
    assertType(data['type'], data['value']);
  } catch {
    throw new WarlogError('INVALID_FILE', `variable ${name}: value does not match type ${data['type']}`, { reason: 'var_type', file: path });
  }
  return {
    name,
    type: data['type'],
    value: data['value'],
    rev: Number(data['rev']),
    updated_at: typeof data['updated_at'] === 'string' ? data['updated_at'] : '',
    machine: typeof data['machine'] === 'string' ? data['machine'] : '',
    ...(isPlainRecord(data['schema']) ? { schema: data['schema'] } : {}),
    ...(typeof data['deleted_at'] === 'string' ? { deleted_at: data['deleted_at'] } : {}),
    ...(typeof data['deleted_by'] === 'string' ? { deleted_by: data['deleted_by'] } : {}),
  };
}

/**
 * Serializes a record, refusing one that could not be read back: files above the limit are
 * refused on read, so writing one would leave a variable that cannot be read, replaced or deleted.
 * @param record - Record to store.
 * @returns The YAML text.
 * @throws {WarlogError} `VALIDATION` (`too_large`) when the file would exceed the limit.
 */
function serialize(record: VarRecord): string {
  const text = stringifyYaml(record);
  if (Buffer.byteLength(text) > MAX_STORE_FILE_BYTES) {
    throw new WarlogError('VALIDATION', `variable ${record.name} would be larger than ${MAX_STORE_FILE_BYTES / (1024 * 1024)} MiB once stored`, { field: 'value', reason: 'too_large' });
  }
  return text;
}

/** Reads and writes variable files. */
export class VarRepository {
  /** Collaborators. */
  private readonly deps: VarRepositoryDeps;

  /**
   * Creates the repository.
   * @param deps - Collaborators.
   */
  constructor(deps: VarRepositoryDeps) {
    this.deps = deps;
  }

  /**
   * Reads a live variable (soft-deleted ones read as absent).
   * @param location - Where to look.
   * @returns The record, or `undefined` when there is none.
   * @throws {WarlogError} `INVALID_FILE` for a malformed file or a value not matching its type; `VALIDATION` for an unsafe name or project id; `NO_REPO_CONTEXT`.
   */
  async read(location: VarLocation): Promise<VarRecord | undefined> {
    const record = await this.readAny(await this.pathOf(location), location.name);
    return record?.deleted_at === undefined ? record : undefined;
  }

  /**
   * Creates or replaces a variable under its lock. The change is computed from the current
   * record (live or deleted), so type rules see the real state.
   * @param location - Where to write.
   * @param change - Computes the new content from the current live record.
   * @returns The stored record.
   * @throws {WarlogError} Whatever `change` throws; `INVALID_FILE`; `NO_REPO_CONTEXT`.
   */
  async write(location: VarLocation, change: (current: VarRecord | undefined) => VarContent): Promise<VarRecord> {
    const path = await this.pathOf(location);
    return this.locked(path, async () => {
      const existing = await this.readAny(path, location.name);
      const content = change(existing?.deleted_at === undefined ? existing : undefined);
      const record: VarRecord = {
        name: location.name,
        type: content.type,
        value: content.value,
        ...(content.schema === undefined ? {} : { schema: content.schema }),
        rev: (existing?.rev ?? 0) + 1,
        updated_at: this.deps.clock.now().toISOString(),
        machine: await this.deps.machine.get(),
      };
      await this.deps.fs.writeFileAtomic(path, serialize(record));
      return record;
    });
  }

  /**
   * Soft-deletes a variable (WL-08).
   * @param location - Where it lives.
   * @param by - Who deletes (`''` when unknown).
   * @returns The deleted record, or `undefined` when there was none.
   * @throws {WarlogError} `INVALID_FILE`; `NO_REPO_CONTEXT`.
   */
  async remove(location: VarLocation, by: string): Promise<VarRecord | undefined> {
    const path = await this.pathOf(location);
    return this.locked(path, async () => {
      const existing = await this.readAny(path, location.name);
      if (existing === undefined || existing.deleted_at !== undefined) {
        return undefined;
      }
      const record: VarRecord = {
        ...existing,
        rev: existing.rev + 1,
        updated_at: this.deps.clock.now().toISOString(),
        machine: await this.deps.machine.get(),
        deleted_at: this.deps.clock.now().toISOString(),
        deleted_by: by,
      };
      await this.deps.fs.writeFileAtomic(path, serialize(record));
      return existing;
    });
  }

  /**
   * Path of a variable file, confined to its root (WL-49).
   * @param location - Variable location.
   * @returns The absolute path.
   * @throws {WarlogError} `VALIDATION` for an unsafe name or project id; `NO_REPO_CONTEXT` without repository for repository or project scope.
   */
  async pathOf(location: VarLocation): Promise<string> {
    assertValid(isVarName(location.name), 'name', 'a variable name ([a-z0-9_.-], 1-128, no "..")');
    const file = `${location.name}.yaml`;
    if (location.scope === 'global') {
      return this.deps.guard.resolveInside(this.deps.roots.global, 'global', 'vars', file);
    }
    const repo = this.deps.roots.repository;
    if (repo === undefined) {
      throw new WarlogError('NO_REPO_CONTEXT', 'not inside a git repository; repository scope unavailable');
    }
    if (location.scope === 'repo') {
      return this.deps.guard.resolveInside(repo.root, 'vars', file);
    }
    assertValid(location.projectId !== undefined && isUlid(location.projectId), 'project_id', 'a ULID');
    return this.deps.guard.resolveInside(repo.root, 'projects', String(location.projectId), 'vars', file);
  }

  /**
   * Reads a variable file, deleted ones included.
   * @param path - File path.
   * @param name - Expected name.
   * @returns The record, or `undefined` when the file does not exist.
   * @throws {WarlogError} `INVALID_FILE`.
   */
  private async readAny(path: string, name: string): Promise<VarRecord | undefined> {
    if ((await this.deps.fs.stat(path)) === undefined) {
      return undefined;
    }
    const text = await this.deps.fs.readFileBounded(path, MAX_STORE_FILE_BYTES);
    if (text === undefined) {
      throw new WarlogError('INVALID_FILE', `variable ${name}: file is too large`, { reason: 'too_large', file: path });
    }
    if (hasMergeConflictMarkers(text)) {
      throw new WarlogError('INVALID_FILE', `variable ${name}: unresolved merge conflict`, { reason: 'merge_conflict', file: path });
    }
    return toRecord(parseYaml(text, path), path, name);
  }

  /**
   * Runs a critical section under a variable's lock; a failing release never masks the outcome.
   * @param path - Variable file path.
   * @param section - Work to do.
   * @returns The section's result.
   */
  private async locked<T>(path: string, section: () => Promise<T>): Promise<T> {
    const release = await this.deps.fs.lock(path);
    try {
      return await section();
    } finally {
      await release().catch(() => undefined);
    }
  }
}
