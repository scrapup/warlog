/**
 * Opens the entity repository of one call's roots (plan §7.2): composition roots build the
 * factory once; domain operations ask it for the store of the roots they were called with.
 */
import type { Clock } from '../ports/clock.port.ts';
import type { FileSystem } from '../ports/file-system.port.ts';
import type { MachineIdProvider } from '../ports/machine-id.port.ts';
import type { PathGuard } from '../security/path-guard.ts';
import { EntityFileRepository } from './entity-file-repository.ts';
import { EntityPaths } from './entity-paths.ts';
import type { StoreRoots } from './store-roots.ts';

/** Entity paths and repository bound to one set of roots. */
export interface EntityStore {
  /** Confined entity paths. */
  readonly paths: EntityPaths;
  /** Entity persistence. */
  readonly repo: EntityFileRepository;
}

/** What a store is opened for. */
export interface EntityStoreRequest {
  /** Roots of the call. */
  readonly roots: StoreRoots;
  /** Clock of the call. */
  readonly clock: Clock;
  /** Machine id of the writer. */
  readonly machine: MachineIdProvider;
}

/** Opens the store of a call. */
export type EntityStoreFactory = (request: EntityStoreRequest) => EntityStore;

/**
 * Builds the production factory.
 * @param fs - File system.
 * @param guard - Path guard.
 * @returns The factory.
 */
export function entityStoreFactory(fs: FileSystem, guard: PathGuard): EntityStoreFactory {
  return (request) => {
    const paths = new EntityPaths(request.roots, guard);
    return { paths, repo: new EntityFileRepository({ fs, paths, clock: request.clock, machine: request.machine }) };
  };
}
