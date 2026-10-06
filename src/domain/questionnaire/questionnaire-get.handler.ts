/**
 * Reads one questionnaire.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { QuestionnaireGetInput } from './questionnaire-get.operation.ts';
import type { Questionnaire, QuestionnaireStoreFactory } from './questionnaire.store.ts';

/**
 * Full view of a questionnaire.
 * @param q - Questionnaire.
 * @returns The fields shown by `questionnaire_get`.
 */
export function questionnaireView(q: Questionnaire): Record<string, unknown> {
  return { slug: q.slug, title: q.title, version: q.version, scope: q.scope, ...(q.builtin ? { builtin: true } : {}), ...(q.description === '' ? {} : { description: q.description }), questions: q.questions };
}

/** Handles `questionnaire_get`. */
export class QuestionnaireGetHandler implements OperationHandler<QuestionnaireGetInput> {
  /** Questionnaire store factory. */
  private readonly stores: QuestionnaireStoreFactory;

  /**
   * Creates the handler.
   * @param stores - Questionnaire store factory.
   */
  constructor(stores: QuestionnaireStoreFactory) {
    this.stores = stores;
  }

  /**
   * Returns the questionnaire.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The questionnaire.
   * @throws {WarlogError} `NOT_FOUND`; `INVALID_FILE` for a malformed file.
   */
  async handle(input: QuestionnaireGetInput, context: OperationContext): Promise<OperationResult> {
    return { kind: 'object', value: questionnaireView(await this.stores(context).resolve(input.slug, input.scope)) };
  }
}
