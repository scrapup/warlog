/**
 * Defines or redefines a questionnaire.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { EntityRecord } from '../../core/storage/entity-ref.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { Question } from './question-type-registry.ts';
import { assertQuestions } from './questionnaire-rules.ts';
import type { QuestionnaireDefineInput } from './questionnaire-define.operation.ts';
import { refOfQuestionnaire } from './questionnaire.store.ts';
import type { QuestionnaireScope, QuestionnaireStoreFactory } from './questionnaire.store.ts';

/** Where and what a definition is saved as. */
interface SaveTarget {
  /** Scope. */
  readonly scope: QuestionnaireScope;
  /** New version. */
  readonly version: number;
  /** The stored record, when the file exists. */
  readonly current: EntityRecord | undefined;
}

/** Handles `questionnaire_define`. */
export class QuestionnaireDefineHandler implements OperationHandler<QuestionnaireDefineInput> {
  /** Writer factory. */
  private readonly writers: WriterFactory;
  /** Questionnaire store factory. */
  private readonly stores: QuestionnaireStoreFactory;

  /**
   * Creates the handler.
   * @param writers - Writer factory.
   * @param stores - Questionnaire store factory.
   */
  constructor(writers: WriterFactory, stores: QuestionnaireStoreFactory) {
    this.writers = writers;
    this.stores = stores;
  }

  /**
   * Stores the questionnaire.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ slug, scope, version, title, questions, created }`.
   * @throws {WarlogError} `VALIDATION` (duplicate ids, conditions on later questions); `NO_REPO_CONTEXT`; `CONFLICT`.
   */
  async handle(input: QuestionnaireDefineInput, context: OperationContext): Promise<OperationResult> {
    assertQuestions(input.questions as Question[]);
    const scope = input.scope ?? (context.roots.repository === undefined ? 'global' : 'repo');
    const current = await this.stores(context).at(input.slug, scope);
    const version = (current?.version ?? 0) + 1;
    const created = current?.record === undefined;
    await this.save(context, input, { scope, version, current: current?.record });
    return { kind: 'object', value: { slug: input.slug, scope, version, title: input.title, questions: input.questions.length, created } };
  }

  /**
   * Writes the file: creates it, or replaces the stored version.
   * @param context - Call context.
   * @param input - Input.
   * @param target - Scope, new version and the stored record, when any.
   * @returns When written.
   * @throws {WarlogError} `NO_REPO_CONTEXT`; `CONFLICT`.
   */
  private async save(context: OperationContext, input: QuestionnaireDefineInput, target: SaveTarget): Promise<void> {
    const fields = { slug: input.slug, title: input.title, version: target.version, questions: input.questions };
    const writer = this.writers(context);
    const ref = refOfQuestionnaire(input.slug, target.scope);
    const summary = `Questionnaire '${input.slug}' ${target.version === 1 ? 'defined' : `redefined (version ${target.version})`} at ${target.scope} scope`;
    if (target.current === undefined) {
      await writer.create(ref, fields, input.description ?? '', summary);
      return;
    }
    await writer.updateRef(ref, Number(target.current.data['rev']), { patch: fields, body: input.description ?? '' }, [{ action: 'updated', summary, extra: { field: 'version', new_value: String(target.version) } }]);
  }
}
