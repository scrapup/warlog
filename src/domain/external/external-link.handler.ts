/**
 * Adds an external reference to an epic, story or task.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { entityById } from '../link/link-store.ts';
import { labelOf } from '../link/node-label.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { ExternalLinkInput } from './external-link.operation.ts';
import { assertHolder, externalsOfEntity } from './external.schema.ts';

/** Most references one item holds. */
const MAX_EXTERNALS = 20;

/** Handles `external_link`. */
export class ExternalLinkHandler implements OperationHandler<ExternalLinkInput> {
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
   * Adds (or updates the URL of) the reference.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, id, external }`.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` for a wrong entity type, a key held by another item or too many references; `CONFLICT`.
   */
  async handle(input: ExternalLinkInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const holder = entityById(view, input.id);
    assertHolder(holder);
    const other = view.byExternal(input.system, input.key);
    if (other !== undefined && !other.deleted && other.id !== holder.id) {
      throw new WarlogError('VALIDATION', `${input.system} ${input.key} is already linked to ${other.type} ${other.id}`, { field: 'key', holder: other.id });
    }
    const current = externalsOfEntity(holder);
    const reference = { system: input.system, key: input.key, ...(input.url === undefined ? {} : { url: input.url }) };
    const kept = current.filter((e) => !(e.system === input.system && e.key === input.key));
    if (kept.length >= MAX_EXTERNALS) {
      throw new WarlogError('VALIDATION', `an item holds at most ${MAX_EXTERNALS} external references`, { field: 'id' });
    }
    const unchanged = current.length > kept.length && JSON.stringify(current.find((e) => e.system === input.system && e.key === input.key)) === JSON.stringify(reference);
    if (!unchanged) {
      await this.writers(context).update(holder, { patch: { external: [...kept, reference] } }, [
        { action: 'updated', summary: `External reference ${input.system} ${input.key} linked to '${labelOf(holder)}'`, extra: { field: 'external' } },
      ]);
    }
    return { kind: 'object', value: { message: unchanged ? 'Reference already linked.' : 'Reference linked.', id: holder.id, external: reference } };
  }
}
