/**
 * Lists memories.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { tagsOf, text } from '../shared/rows.ts';
import type { MemoryListInput } from './memory-list.operation.ts';
import { bySpecificityThenRecency, isInPlay, liveMemories, memoryRow, scopeOfMemory } from './memory-rows.ts';

/** Handles `memory_list`. */
export class MemoryListHandler implements OperationHandler<MemoryListInput> {
  /**
   * Lists the memories.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   */
  async handle(input: MemoryListInput, context: OperationContext): Promise<OperationResult> {
    const rows = liveMemories(await context.index.full())
      .filter((m) => (input.status === undefined ? isInPlay(m) : text(m, 'status') === input.status))
      .filter((m) => input.scope === undefined || scopeOfMemory(m) === input.scope)
      .filter((m) => input.kind === undefined || text(m, 'kind') === input.kind)
      .filter((m) => input.tag === undefined || tagsOf(m).includes(input.tag))
      .sort(bySpecificityThenRecency)
      .slice(0, input.limit)
      .map((m) => memoryRow(m));
    return { kind: 'list', rows };
  }
}
