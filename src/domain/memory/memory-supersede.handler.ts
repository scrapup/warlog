/**
 * Supersedes a memory: two writes, the replaced memory first (it leaves recall at once), then
 * the back link on the replacement.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { hasLink, linksOfEntity } from '../link/link-store.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { MemorySupersedeInput } from './memory-supersede.operation.ts';

/** Statuses a memory can be superseded from, and replaced by. */
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
   * Links the two memories. The two writes are not atomic: when the second one failed, calling
   * again with the same two ids completes it instead of being refused.
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
    const resuming = text(old, 'status') === 'superseded' && text(old, 'superseded_by') === next.id;
    for (const m of [resuming ? undefined : old, next]) {
      if (m !== undefined && !OPEN_STATUSES.includes(text(m, 'status'))) {
        throw new WarlogError('VALIDATION', `memory ${m.id} is ${text(m, 'status')}; only active or stale memories take part`, { status: text(m, 'status') });
      }
    }
    const writer = this.writers(context);
    const replaced = resuming
      ? old.record
      : await writer.update(old, { patch: { status: 'superseded', superseded_by: next.id, status_reason: input.reason } }, [
          { action: 'status_changed', summary: `Memory '${text(old, 'title')}' superseded by ${next.id}`, extra: { field: 'status', old_value: text(old, 'status'), new_value: 'superseded' } },
        ]);
    const links = linksOfEntity(next);
    const replacement = hasLink(links, 'supersedes', old.id)
      ? next.record
      : await writer.update(next, { patch: { links: [...links, { rel: 'supersedes', target: old.id }] } }, [{ action: 'updated', summary: `Memory '${text(next, 'title')}' supersedes ${old.id}` }]);
    return { kind: 'object', value: { message: `Memory ${old.id} superseded by ${next.id}.`, superseded: entityRow(replaced, 'content'), replacement: entityRow(replacement, 'content') } };
  }
}
