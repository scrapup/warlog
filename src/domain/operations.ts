/**
 * The product operation registry content (WL-35): every operation exposed by both interfaces is
 * listed here.
 */
import type { OperationDefinition } from '../core/mediator/operation-definition.ts';
import type { FileSystem } from '../core/ports/file-system.port.ts';
import type { Logger } from '../core/ports/logger.port.ts';
import { doctorOperation } from './health/doctor.operation.ts';

/** Ports available to the domain operations (each group takes what it needs). */
export interface DomainDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Logger. */
  readonly logger: Logger;
}

/** Builds the registry content from the domain collaborators. */
export type OperationsFactory = (deps: DomainDeps) => OperationDefinition[];

/**
 * Builds the product operations.
 * @param deps - Domain collaborators.
 * @returns The registry content.
 */
export function productOperations(deps: DomainDeps): OperationDefinition[] {
  return [doctorOperation(deps.logger)];
}
