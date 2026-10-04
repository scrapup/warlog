/**
 * Test helper: an in-memory store with roots, paths, repository and activity log.
 */
import { join, resolve } from 'node:path';
import { PathGuard } from '../../src/core/security/path-guard.ts';
import { ActivityLog } from '../../src/core/storage/activity-log.ts';
import { EntityFileRepository } from '../../src/core/storage/entity-file-repository.ts';
import { EntityPaths } from '../../src/core/storage/entity-paths.ts';
import type { StoreRoots } from '../../src/core/storage/store-roots.ts';
import { MemoryFileSystem } from './fakes/memory-file-system.ts';
import { FixedClock, FixedMachineId, RecordingLogger } from './fakes/simple-fakes.ts';

/** Global root of the fixture. */
export const GLOBAL_ROOT = resolve('/home/u/.warlog');
/** Repository root of the fixture. */
export const REPO_ROOT = resolve('/src/warlog/.warlog');

/** Collaborators of an in-memory store. */
export interface MemoryStore {
  /** File system. */
  readonly fs: MemoryFileSystem;
  /** Clock. */
  readonly clock: FixedClock;
  /** Machine id. */
  readonly machine: FixedMachineId;
  /** Logger. */
  readonly logger: RecordingLogger;
  /** Roots. */
  readonly roots: StoreRoots;
  /** Paths. */
  readonly paths: EntityPaths;
  /** Entity repository. */
  readonly repo: EntityFileRepository;
  /** Activity log. */
  readonly activity: ActivityLog;
}

/**
 * Builds an in-memory store.
 * @param options - Fixture options.
 * @param options.withRepository - Whether a repository root exists (default true).
 * @param options.machine - Machine id.
 * @returns The store.
 */
export function memoryStore(options: { withRepository?: boolean; machine?: string } = {}): MemoryStore {
  const fs = new MemoryFileSystem();
  const clock = new FixedClock();
  const machine = new FixedMachineId(options.machine);
  const logger = new RecordingLogger();
  const guard = new PathGuard(fs);
  const repository = { root: REPO_ROOT, key: 'github.com__scrapup__warlog', mode: 'in-repo' as const, mainWorktree: join(REPO_ROOT, '..') };
  const roots: StoreRoots = options.withRepository === false ? { global: GLOBAL_ROOT, warnings: [] } : { global: GLOBAL_ROOT, repository, warnings: [] };
  const paths = new EntityPaths(roots, guard);
  return {
    fs,
    clock,
    machine,
    logger,
    roots,
    paths,
    repo: new EntityFileRepository({ fs, paths, clock, machine }),
    activity: new ActivityLog({ fs, clock, machine, guard, logger }),
  };
}
