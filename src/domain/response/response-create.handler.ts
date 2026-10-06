/**
 * Creates a response (`projects/<project>/responses/<id>.md`): validates every answer first, then
 * stores the answers with a copy of the questions.
 */
import { WarlogError, isWarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { assertAnswers } from '../questionnaire/answer-validation.ts';
import { refOfQuestionnaire } from '../questionnaire/questionnaire.store.ts';
import type { Questionnaire, QuestionnaireStoreFactory } from '../questionnaire/questionnaire.store.ts';
import { entityById } from '../link/link-store.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { TrackerWriter } from '../shared/tracker-writer.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { responseBody } from './response-body.ts';
import type { ResponseCreateInput } from './response-create.operation.ts';

/** Entity types a response can be about. */
const SUBJECTS = new Set(['task', 'story', 'epic', 'project']);

/**
 * Writes the built-in questionnaire as a global file the first time it is used (plan §3.4).
 * @param writer - Writer.
 * @param q - The questionnaire in use.
 * @returns When done (a concurrent creation is not an error).
 */
async function materializeBuiltin(writer: TrackerWriter, q: Questionnaire): Promise<void> {
  if (!q.builtin) {
    return;
  }
  try {
    await writer.create(refOfQuestionnaire(q.slug, 'global'), { slug: q.slug, title: q.title, version: q.version, questions: q.questions }, '', `Built-in questionnaire '${q.slug}' created on first use`);
  } catch (error: unknown) {
    if (!isWarlogError(error, 'CONFLICT')) {
      throw error;
    }
  }
}

/** Handles `response_create`. */
export class ResponseCreateHandler implements OperationHandler<ResponseCreateInput> {
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
   * Stores the response.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The response.
   * @throws {WarlogError} `NOT_FOUND` (subject or questionnaire); `VALIDATION` listing every invalid question, or a subject of another type; `NO_REPO_CONTEXT`.
   */
  async handle(input: ResponseCreateInput, context: OperationContext): Promise<OperationResult> {
    const subject = entityById(await context.index.full(), input.subject_id);
    if (!SUBJECTS.has(subject.type)) {
      throw new WarlogError('VALIDATION', `a response is about a task, story, epic or project, not ${subject.type}`, { field: 'subject_id', type: subject.type });
    }
    const questionnaire = await this.stores(context).resolve(input.questionnaire, input.scope);
    assertAnswers(questionnaire.questions, input.answers);
    const writer = this.writers(context);
    await materializeBuiltin(writer, questionnaire);
    const projectId = subject.type === 'project' ? subject.id : String(subject.projectId);
    const fields = {
      project_id: projectId,
      questionnaire: questionnaire.slug,
      questionnaire_version: questionnaire.version,
      questions: questionnaire.questions,
      subject: { type: subject.type, id: subject.id },
      answers: input.answers,
    };
    const record = await writer.create(
      { type: 'response', id: context.ids.next(), scope: 'repo', projectId },
      fields,
      responseBody(questionnaire.questions, input.answers),
      `Response to '${questionnaire.slug}' v${questionnaire.version} about ${subject.type} '${text(subject, 'title') || text(subject, 'name')}'`,
    );
    return { kind: 'object', value: entityRow(record, 'content') };
  }
}
