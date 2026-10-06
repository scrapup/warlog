/**
 * Applies a template to an epic: one new task per definition.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { newTaskFields } from '../task/task-create.handler.ts';
import type { TemplateApplyInput } from './template-apply.operation.ts';
import { templateTasks } from './template-rules.ts';
import { substitute } from './template-substitution.ts';

/** Handles `template_apply`. */
export class TemplateApplyHandler implements OperationHandler<TemplateApplyInput> {
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
   * Creates the tasks.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, template_name, epic_name, tasks_created, tasks, unresolved }`.
   * @throws {WarlogError} `NOT_FOUND` for an unknown or deleted template, or an unknown epic.
   */
  async handle(input: TemplateApplyInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const template = requireInView(view, 'template', input.template_id);
    if (template.deleted) {
      throw new WarlogError('NOT_FOUND', `template ${template.id} not found`, { type: 'template', id: template.id });
    }
    const epic = requireInView(view, 'epic', input.epic_id);
    const variables = input.variables ?? {};
    const writer = this.writers(context);
    const unresolved = new Set<string>();
    const tasks = [];
    for (const def of templateTasks(template)) {
      const title = substitute(def.title, variables);
      const description = substitute(def.description ?? '', variables);
      [...title.unresolved, ...description.unresolved].forEach((n) => unresolved.add(n));
      const fields = newTaskFields(
        { projectId: String(epic.projectId), epicId: epic.id, storyId: undefined },
        { title: title.text, status: 'todo', priority: def.priority, tags: def.tags ?? [], extra: def.estimated_hours === undefined ? {} : { estimated_hours: def.estimated_hours } },
      );
      const ref = { type: 'task' as const, id: context.ids.next(), scope: 'repo' as const, projectId: String(epic.projectId) };
      tasks.push(entityRow(await writer.create(ref, fields, description.text, `Task '${title.text}' created from template '${text(template, 'name')}'`)));
    }
    const names = { template_name: text(template, 'name'), epic_name: text(epic, 'name') };
    return { kind: 'object', value: { message: `Applied template '${names.template_name}' to epic '${names.epic_name}'`, ...names, tasks_created: tasks.length, tasks, unresolved: [...unresolved] } };
  }
}
