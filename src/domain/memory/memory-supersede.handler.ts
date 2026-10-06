/**
 * Supersedes a memory: two writes, the replaced memory first (it leaves recall at once), then
 * the back link on the replacement.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { MemorySupersedeInput } from './memory-supersede.operation.ts';

const OPEN_STATUSES = ['active', 'stale'];

/** Handles `memory_supersede`. */
export class MemorySupersedeHandler implements OperationHandler<MemorySupersedeInput> {
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
   * Links the two memories.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, superseded, replacement }`.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` for the same memory twice or a memory that is not active or stale; `CONFLICT`.
   */
  async handle(input: MemorySupersedeInput, context: OperationContext): Promise<OperationResult> {
    if (input.id === input.superseded_by) {
      throw new WarlogError('VALIDATION', 'a memory cannot supersede itself', { field: 'superseded_by' });
    }
    const old = await requireEntity(context.index, 'memory', input.id);
    const next = await requireEntity(context.index, 'memory', input.superseded_by);
    for (const m of [old, next]) {
      if (!OPEN_STATUSES.includes(text(m, 'status'))) {
        throw new WarlogError('VALIDATION', `memory ${m.id} is ${text(m, 'status')}; only active or stale memories take part`, { status: text(m, 'status') });
      }
    }
    const writer = this.writers(context);
    const replaced = await writer.update(old, { patch: { status: 'superseded', superseded_by: next.id, status_reason: input.reason } }, [
      { action: 'status_changed', summary: `Memory '${text(old, 'title')}' superseded by ${next.id}`, extra: { field: 'status', old_value: text(old, 'status'), new_value: 'superseded' } },
    ]);
    const links = Array.isArray(next.record.data['links']) ? next.record.data['links'] : [];
    const replacement = await writer.update(next, { patch: { links: [...links, { rel: 'supersedes', target: old.id }] } }, [{ action: 'updated', summary: `Memory '${text(next, 'title')}' supersedes ${old.id}` }]);
    return { kind: 'object', value: { message: `Memory ${old.id} superseded by ${next.id}.`, superseded: entityRow(replaced, 'content'), replacement: entityRow(replacement, 'content') } };
  }
}
