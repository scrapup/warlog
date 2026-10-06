/**
 * Moves a memory along its lifecycle by an explicit call (WL-17): `memory_mark_stale` and
 * `memory_archive` share this handler, configured by the transition they perform.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { MemoryStatusInput } from './memory-status.operation.ts';

/** A lifecycle transition. */
export interface Transition {
  /** Status reached. */
  readonly to: 'stale' | 'archived';
  /** Statuses it may start from. */
  readonly from: readonly string[];
  /** Past-tense verb for messages. */
  readonly verb: string;
}

/** Handles a lifecycle transition. */
export class MemoryStatusHandler implements OperationHandler<MemoryStatusInput> {
  /** Writer factory. */
  private readonly writers: WriterFactory;
  /** Transition performed. */
  private readonly transition: Transition;

  /**
   * Creates the handler.
   * @param writers - Writer factory.
   * @param transition - Transition performed.
   */
  constructor(writers: WriterFactory, transition: Transition) {
    this.writers = writers;
    this.transition = transition;
  }

  /**
   * Applies the transition; asking for the current status changes nothing.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, memory }`.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` when the memory is in a status the transition does not start from; `CONFLICT`.
   */
  async handle(input: MemoryStatusInput, context: OperationContext): Promise<OperationResult> {
    const memory = await requireEntity(context.index, 'memory', input.id);
    const status = text(memory, 'status');
    if (status === this.transition.to) {
      return { kind: 'object', value: { message: `Memory ${memory.id} is already ${status}.`, memory: entityRow(memory.record, 'content') } };
    }
    if (!this.transition.from.includes(status)) {
      throw new WarlogError('VALIDATION', `memory ${memory.id} is ${status}; only ${this.transition.from.join(' or ')} memories can be ${this.transition.verb}`, { status });
    }
    const record = await this.writers(context).update(memory, { patch: { status: this.transition.to, status_reason: input.reason } }, [
      { action: 'status_changed', summary: `Memory '${text(memory, 'title')}' ${this.transition.verb}`, extra: { field: 'status', old_value: status, new_value: this.transition.to } },
    ]);
    return { kind: 'object', value: { message: `Memory ${memory.id} ${this.transition.verb}.`, memory: entityRow(record, 'content') } };
  }
}
