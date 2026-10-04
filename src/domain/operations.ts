/**
 * The product operation registry content (WL-35): every operation exposed by both interfaces is
 * listed here. Domain groups add their definitions as they land (US-97 onwards).
 */
import type { OperationDefinition } from '../core/mediator/operation-definition.ts';
import type { FileSystem } from '../core/ports/file-system.port.ts';
import type { Logger } from '../core/ports/logger.port.ts';

/** Ports the domain operations are built with. */
export interface DomainServices {
  /** File system. */
  readonly fs: FileSystem;
  /** Logger. */
  readonly logger: Logger;
}

/**
 * Builds the product operations. Domain groups take {@link DomainServices} as they land.
 * @returns The registry content.
 */
export function productOperations(): OperationDefinition[] {
  return [];
}
