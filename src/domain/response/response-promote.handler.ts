/**
 * Promotes an answer to a memory that links back to the response.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';
import type { MemoryScope } from '../memory/memory.schema.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { promotableText } from './promotable-text.ts';
import type { ResponsePromoteInput } from './response-promote.operation.ts';

/** Longest default title. */
const TITLE_CHARS = 80;

/** Handles `response_promote`. */
export class ResponsePromoteHandler implements OperationHandler<ResponsePromoteInput> {
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
   * Creates the memory.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The memory and the response it came from.
   * @throws {WarlogError} `NOT_FOUND` for an unknown response; `VALIDATION` for a missing answer or a bad item index; `NO_REPO_CONTEXT`.
   */
  async handle(input: ResponsePromoteInput, context: OperationContext): Promise<OperationResult> {
    const response = await requireEntity(context.index, 'response', input.response_id);
    const answers = response.record.data['answers'];
    const lesson = promotableText(isPlainRecord(answers) ? answers[input.question_id] : undefined, input.item_index);
    const scope: MemoryScope = input.scope ?? (context.roots.repository === undefined ? 'global' : 'repo');
    const title = input.title ?? lesson.split('\n')[0]?.slice(0, TITLE_CHARS) ?? lesson;
    const record = await this.writers(context).create(
      { type: 'memory', id: context.ids.next(), scope },
      { scope, kind: input.kind, title, status: 'active', links: [{ rel: 'derived_from', target: response.id }], tags: [text(response, 'questionnaire')] },
      lesson,
      `Memory '${title}' (${input.kind}) promoted from response ${response.id}`,
    );
    return { kind: 'object', value: { response_id: response.id, question_id: input.question_id, memory: entityRow(record, 'content') } };
  }
}
