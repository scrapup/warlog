/**
 * Removes an external reference.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { entityById } from '../link/link-store.ts';
import { labelOf } from '../link/node-label.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { ExternalUnlinkInput } from './external-unlink.operation.ts';
import { externalsOfEntity } from './external.schema.ts';

/** Handles `external_unlink`. */
export class ExternalUnlinkHandler implements OperationHandler<ExternalUnlinkInput> {
  /** Writer factory. */
  private readonly writers: WriterFactory;

  /**
   * Creates the handler.
   * @param writers - Writer factory.
   */
  constructor(writers: WriterFactory) {
    this.writers = writers;
  }

  /**
   * Removes the reference.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, id, system, key }`.
   * @throws {WarlogError} `NOT_FOUND` for an unknown entity or reference; `CONFLICT`.
   */
  async handle(input: ExternalUnlinkInput, context: OperationContext): Promise<OperationResult> {
    const holder = entityById(await context.index.full(), input.id);
    const current = externalsOfEntity(holder);
    const remaining = current.filter((e) => !(e.system === input.system && e.key === input.key));
    if (remaining.length === current.length) {
      throw new WarlogError('NOT_FOUND', `${holder.id} has no ${input.system} reference ${input.key}`, { type: 'external', id: holder.id });
    }
    await this.writers(context).update(holder, { patch: { external: remaining.length === 0 ? undefined : remaining } }, [
      { action: 'updated', summary: `External reference ${input.system} ${input.key} unlinked from '${labelOf(holder)}'`, extra: { field: 'external' } },
    ]);
    return { kind: 'object', value: { message: 'Reference unlinked.', id: holder.id, system: input.system, key: input.key } };
  }
}
