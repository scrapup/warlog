/**
 * Adds a link to an entity.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { LinkAddInput } from './link-add.operation.ts';
import { MAX_LINKS, entityById, hasLink, linksOfEntity } from './link-store.ts';
import { parseLinkTarget } from './link-target-parser.ts';

/** Handles `link_add`. */
export class LinkAddHandler implements OperationHandler<LinkAddInput> {
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
   * Adds the link; adding an existing link changes nothing.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, id, rel, target, pending }`.
   * @throws {WarlogError} `NOT_FOUND` for an unknown source; `VALIDATION` for a self link or too many links; `CONFLICT`.
   */
  async handle(input: LinkAddInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const source = entityById(view, input.id);
    if (input.target === source.id) {
      throw new WarlogError('VALIDATION', 'an entity cannot link to itself', { field: 'target' });
    }
    const links = linksOfEntity(source);
    const pending = parseLinkTarget(input.target)?.kind === 'entity' && view.get(input.target) === undefined;
    if (pending) {
      context.warnings.push('link.pending_target');
    }
    const result = { id: source.id, rel: input.rel, target: input.target, pending };
    if (hasLink(links, input.rel, input.target)) {
      return { kind: 'object', value: { message: 'Link already exists.', ...result } };
    }
    if (links.length >= MAX_LINKS) {
      throw new WarlogError('VALIDATION', `an entity holds at most ${MAX_LINKS} links`, { field: 'id' });
    }
    await this.writers(context).update(source, { patch: { links: [...links, { rel: input.rel, target: input.target }] } }, [
      { action: 'updated', summary: `Link ${input.rel} -> ${input.target} added to '${text(source, 'title') || text(source, 'name')}'`, extra: { field: 'links' } },
    ]);
    return { kind: 'object', value: { message: pending ? 'Link added; the target is not in the store yet (pending).' : 'Link added.', ...result } };
  }
}
