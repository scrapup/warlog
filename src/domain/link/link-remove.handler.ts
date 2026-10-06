/**
 * Removes a link from an entity.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { LinkRemoveInput } from './link-remove.operation.ts';
import { entityById, hasLink, linksOfEntity } from './link-store.ts';

/** Handles `link_remove`. */
export class LinkRemoveHandler implements OperationHandler<LinkRemoveInput> {
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
   * Removes the link.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, id, rel, target }`.
   * @throws {WarlogError} `NOT_FOUND` for an unknown entity or link; `CONFLICT`.
   */
  async handle(input: LinkRemoveInput, context: OperationContext): Promise<OperationResult> {
    const source = entityById(await context.index.full(), input.id);
    const links = linksOfEntity(source);
    if (!hasLink(links, input.rel, input.target)) {
      throw new WarlogError('NOT_FOUND', `${source.id} has no ${input.rel} link to ${input.target}`, { type: 'link', id: source.id });
    }
    const remaining = links.filter((l) => !(l.rel === input.rel && l.target === input.target));
    await this.writers(context).update(source, { patch: { links: remaining.length === 0 ? undefined : remaining } }, [
      { action: 'updated', summary: `Link ${input.rel} -> ${input.target} removed from '${text(source, 'title') || text(source, 'name')}'`, extra: { field: 'links' } },
    ]);
    return { kind: 'object', value: { message: 'Link removed.', id: source.id, rel: input.rel, target: input.target } };
  }
}
