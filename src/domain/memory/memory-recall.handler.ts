/**
 * Recalls memories and records the usage (WL-18): one `recalled` activity record per memory
 * returned, in the root of its scope; the memory files are never rewritten.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { tagsOf, text } from '../shared/rows.ts';
import { isInPlay, liveMemories, memoryFull, scopeOfMemory, searchableText } from './memory-rows.ts';
import type { MemoryRecallInput } from './memory-recall.operation.ts';
import { rankRecalled } from './recall-ranker.ts';
import type { Recalled } from './recall-ranker.ts';
import { matchedTokens, tokenSet, wordTokens } from './token-matcher.ts';

/** Content kept per recalled memory (the rest is read with memory_get). */
export const RECALL_CONTENT_CHARS = 8_000;

/**
 * Queues the usage record of a recalled memory.
 * @param context - Call context.
 * @param recalled - The memory.
 */
function recordRecall(context: OperationContext, recalled: Recalled): void {
  const { memory } = recalled;
  const repo = scopeOfMemory(memory) === 'repo' ? context.roots.repository : undefined;
  context.activity.push({
    root: repo?.root ?? context.roots.global,
    input: {
      action: 'recalled',
      entity_type: 'memory',
      entity_id: memory.id,
      ...(repo === undefined ? {} : { repo_key: repo.key }),
      summary: `Memory '${text(memory, 'title')}' recalled`,
    },
  });
}

/**
 * Result entry of a recalled memory.
 * @param recalled - The memory.
 * @returns The full memory (content cut at {@link RECALL_CONTENT_CHARS}) and its match count.
 */
function entry(recalled: Recalled): Record<string, unknown> {
  const full = memoryFull(recalled.memory);
  const content = typeof full['content'] === 'string' ? full['content'] : '';
  const cut = content.length > RECALL_CONTENT_CHARS;
  return { ...full, ...(cut ? { content: `${content.slice(0, RECALL_CONTENT_CHARS)}…`, truncated: true } : {}), matched: recalled.matched };
}

/** Handles `memory_recall`. */
export class MemoryRecallHandler implements OperationHandler<MemoryRecallInput> {
  /**
   * Finds and ranks the memories.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ count, results }`.
   */
  async handle(input: MemoryRecallInput, context: OperationContext): Promise<OperationResult> {
    const query = [...new Set(wordTokens(input.query))];
    const matches: Recalled[] = liveMemories(await context.index.full())
      .filter((m) => isInPlay(m))
      .filter((m) => input.kind === undefined || text(m, 'kind') === input.kind)
      .filter((m) => input.scope === undefined || scopeOfMemory(m) === input.scope)
      .filter((m) => (input.tags ?? []).every((t) => tagsOf(m).includes(t)))
      .map((memory) => ({ memory, matched: matchedTokens(query, tokenSet(searchableText(memory))) }))
      .filter((r) => r.matched > 0);
    const results = rankRecalled(matches).slice(0, input.limit);
    results.forEach((r) => recordRecall(context, r));
    return { kind: 'object', value: { count: results.length, results: results.map(entry) } };
  }
}
