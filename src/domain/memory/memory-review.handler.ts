/**
 * Lists review candidates without writing anything.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { text } from '../shared/rows.ts';
import { bySpecificityThenRecency, liveMemories, memoryRow, scopeOfMemory } from './memory-rows.ts';
import { freshActivity } from './fresh-activity.ts';
import type { MemoryReviewInput } from './memory-review.operation.ts';
import { likelyDuplicates, unusedMemories } from './review-candidates.ts';

/** Handles `memory_review`. */
export class MemoryReviewHandler implements OperationHandler<MemoryReviewInput> {
  /** File system. */
  private readonly fs: FileSystem;

  /**
   * Creates the handler.
   * @param fs - File system.
   */
  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  /**
   * Builds the review.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ unused_days, unused, stale, likely_duplicates }`.
   */
  async handle(input: MemoryReviewInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    /**
     * Tells whether a memory is in the requested scope.
     * @param m - Memory.
     * @returns `true` when kept.
     */
    const inScope = (m: IndexedEntity): boolean => input.scope === undefined || scopeOfMemory(m) === input.scope;
    const { usage } = await freshActivity(this.fs, context);
    const unused = unusedMemories(view, usage, context.clock.now().getTime(), input.unused_days).filter(inScope);
    const stale = liveMemories(view).filter((m) => text(m, 'status') === 'stale' && inScope(m)).sort(bySpecificityThenRecency);
    const duplicates = likelyDuplicates(liveMemories(view).filter(inScope));
    return {
      kind: 'object',
      value: {
        unused_days: input.unused_days,
        unused: unused.map((m) => memoryRow(m)),
        stale: stale.map((m) => memoryRow(m)),
        likely_duplicates: duplicates.map((d) => ({ overlap: d.overlap, memories: [d.a, d.b].map((m) => ({ id: m.id, title: text(m, 'title'), scope: scopeOfMemory(m) })) })),
      },
    };
  }
}
