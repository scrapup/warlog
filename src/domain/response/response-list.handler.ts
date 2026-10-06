/**
 * Lists responses.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';
import { resolveProjectScope } from '../shared/lookup.ts';
import { byCreation, text } from '../shared/rows.ts';
import type { ResponseListInput } from './response-list.operation.ts';

/** Handles `response_list`. */
export class ResponseListHandler implements OperationHandler<ResponseListInput> {
  /**
   * Lists the responses.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for an unknown project scope.
   */
  async handle(input: ResponseListInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const projectId = resolveProjectScope(context, view, input.project_id);
    const rows = view
      .ofType('response')
      .filter((r) => !r.deleted && (projectId === undefined || r.projectId === projectId))
      .filter((r) => input.questionnaire === undefined || text(r, 'questionnaire') === input.questionnaire)
      .map((r) => ({ response: r, subject: r.record.data['subject'] }))
      .filter(({ subject }) => input.subject_id === undefined || (isPlainRecord(subject) && subject['id'] === input.subject_id))
      .sort((a, b) => byCreation(b.response, a.response))
      .slice(0, input.limit)
      .map(({ response, subject }) => ({
        id: response.id,
        questionnaire: text(response, 'questionnaire'),
        questionnaire_version: response.record.data['questionnaire_version'],
        subject_type: isPlainRecord(subject) ? subject['type'] : undefined,
        subject_id: isPlainRecord(subject) ? subject['id'] : undefined,
        project_id: response.projectId,
        answered: isPlainRecord(response.record.data['answers']) ? Object.keys(response.record.data['answers']).length : 0,
        created_at: response.record.data['created_at'],
      }));
    return { kind: 'list', rows };
  }
}
