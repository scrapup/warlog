/**
 * Lists the questionnaires in effect.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { QuestionnaireListInput } from './questionnaire-list.operation.ts';
import type { QuestionnaireStoreFactory } from './questionnaire.store.ts';

/** Handles `questionnaire_list`. */
export class QuestionnaireListHandler implements OperationHandler<QuestionnaireListInput> {
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
   * Lists the questionnaires.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows.
   */
  async handle(input: QuestionnaireListInput, context: OperationContext): Promise<OperationResult> {
    const store = this.stores(context);
    const rows = (input.scope === undefined ? await store.effective() : await store.definedAt(input.scope))
      .map((q) => ({ slug: q.slug, title: q.title, version: q.version, scope: q.scope, questions: q.questions.length, ...(q.builtin ? { builtin: true } : {}) }));
    return { kind: 'list', rows };
  }
}
