/**
 * Plan of a template application (WL-48): every title and description is substituted and checked
 * against the limits of a task before the first task is created, so a variable that makes one of
 * them too long stops the application instead of leaving it half done.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { DESCRIPTION, TITLE } from '../shared/fields.ts';
import type { TemplateTask } from './template-fields.ts';
import { substitute } from './template-substitution.ts';

/** Longest title a task can have. */
const TITLE_MAX = 500;

/** Longest description a task can have. */
const DESCRIPTION_MAX = 200_000;

/** A task to create. */
export interface PlannedTask {
  /** Substituted title. */
  readonly title: string;
  /** Substituted description. */
  readonly description: string;
  /** Priority of the definition. */
  readonly priority: TemplateTask['priority'];
  /** Tags of the definition. */
  readonly tags: string[];
  /** Estimate of the definition. */
  readonly estimated_hours: number | undefined;
}

/** The whole application, planned. */
export interface TemplatePlan {
  /** Tasks, in definition order. */
  readonly tasks: PlannedTask[];
  /** Variable names the template uses that were not given. */
  readonly unresolved: string[];
}

/**
 * Plans the tasks of a template.
 * @param definitions - Validated definitions.
 * @param variables - Values by name.
 * @returns The plan.
 * @throws {WarlogError} `VALIDATION` when a substituted title or description is not valid.
 */
export function planTasks(definitions: readonly TemplateTask[], variables: Readonly<Record<string, string>>): TemplatePlan {
  const unresolved = new Set<string>();
  const tasks = definitions.map((def, index) => {
    const title = substitute(def.title, variables, TITLE_MAX);
    const description = substitute(def.description ?? '', variables, DESCRIPTION_MAX);
    [...title.unresolved, ...description.unresolved].forEach((n) => unresolved.add(n));
    if (title.tooLong || description.tooLong || !TITLE.safeParse(title.text).success || !DESCRIPTION.safeParse(description.text).success) {
      throw new WarlogError('VALIDATION', `template task ${index + 1} is not valid once the variables are substituted (title 1-500 characters, description up to 200 000)`, { field: 'variables', task: index + 1 });
    }
    return { title: title.text, description: description.text, priority: def.priority, tags: def.tags ?? [], estimated_hours: def.estimated_hours };
  });
  return { tasks, unresolved: [...unresolved] };
}
