/**
 * Builds the playbook of the current repository.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { bySpecificityThenRecency, isInPlay, liveMemories, searchableText } from '../memory/memory-rows.ts';
import { freshActivity } from '../memory/fresh-activity.ts';
import { matchedTokens, tokenSet, wordTokens } from '../memory/token-matcher.ts';
import { text } from '../shared/rows.ts';
import { commandBuckets, runbookEntries, sectionRows } from './playbook-sections.ts';
import type { PlaybookInput } from './playbook.operation.ts';

/**
 * Memories of a kind that are in play and match the topic.
 * @param memories - Live memories.
 * @param kind - Memory kind.
 * @param topic - Distinct topic tokens (empty = no filter).
 * @param limit - Most entries.
 * @returns Memories, repository first then most recent.
 */
function pick(memories: readonly IndexedEntity[], kind: string, topic: readonly string[], limit: number): IndexedEntity[] {
  return memories
    .filter((m) => isInPlay(m) && text(m, 'kind') === kind && (topic.length === 0 || matchedTokens(topic, tokenSet(searchableText(m))) > 0))
    .sort(bySpecificityThenRecency)
    .slice(0, limit);
}

/** Handles `playbook`. */
export class PlaybookHandler implements OperationHandler<PlaybookInput> {
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
   * Builds the sections.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ topic?, environment, runbooks, commands, known_issues, patterns }`.
   */
  async handle(input: PlaybookInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const memories = liveMemories(view);
    const topic = input.topic === undefined ? [] : [...new Set(wordTokens(input.topic))];
    const issues = pick(memories, 'known_issue', topic, input.limit).filter((m) => text(m, 'issue_status') !== 'resolved');
    return {
      kind: 'object',
      value: {
        ...(input.topic === undefined ? {} : { topic: input.topic }),
        environment: context.runtime,
        runbooks: runbookEntries(view, pick(memories, 'runbook', topic, input.limit)),
        commands: commandBuckets((await freshActivity(this.fs, context)).commands, context, pick(memories, 'command', topic, input.limit)),
        known_issues: sectionRows(issues),
        patterns: sectionRows(pick(memories, 'pattern', topic, input.limit)),
      },
    };
  }
}
