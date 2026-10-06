/**
 * Reads one memory by id with a point read.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import type { MemoryGetInput } from './memory-get.operation.ts';
import { memoryFull } from './memory-rows.ts';

/** Handles `memory_get`. */
export class MemoryGetHandler implements OperationHandler<MemoryGetInput> {
  /**
   * Returns the memory (deleted ones are not found).
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The memory.
   * @throws {WarlogError} `NOT_FOUND`.
   */
  async handle(input: MemoryGetInput, context: OperationContext): Promise<OperationResult> {
    const memory = await requireEntity(context.index, 'memory', input.id);
    return { kind: 'object', value: memoryFull(memory) };
  }
}
