/**
 * Gives handlers the writer of their call (constructor-injected factory, plan §7.2).
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { EntityStoreFactory } from '../../core/storage/entity-store.ts';
import { TrackerWriter } from './tracker-writer.ts';

/** Opens the writer of a call. */
export type WriterFactory = (context: OperationContext) => TrackerWriter;

/**
 * Builds the writer factory over an entity store factory.
 * @param stores - Entity store factory.
 * @returns The writer factory.
 */
export function writerFactory(stores: EntityStoreFactory): WriterFactory {
  return (context) => new TrackerWriter(stores(context), context);
}
