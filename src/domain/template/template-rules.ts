/**
 * Template rules: unique names among live templates; templates live in the global root.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { byCreation, listRow, omit, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import type { TemplateTask } from './template-fields.ts';

/**
 * Fails when another live template has a name.
 * @param view - View.
 * @param name - Name.
 * @param self - Template being updated, if any.
 * @throws {WarlogError} `VALIDATION`.
 */
export function assertNameFree(view: StoreView, name: string, self?: string): void {
  const clash = view.ofType('template').find((t) => !t.deleted && t.id !== self && text(t, 'name') === name);
  if (clash !== undefined) {
    throw new WarlogError('VALIDATION', `A template called '${name}' already exists. Pick another name, or edit that one with template_update.`, { field: 'name', holder: clash.id });
  }
}

/**
 * Tasks of a template.
 * @param template - Template.
 * @returns The task definitions.
 */
export function templateTasks(template: IndexedEntity): TemplateTask[] {
  const tasks = template.record.data['tasks'];
  return Array.isArray(tasks) ? (tasks as TemplateTask[]) : [];
}

/**
 * Live templates, newest first.
 * @param view - View.
 * @returns Templates.
 */
export function liveTemplates(view: StoreView): IndexedEntity[] {
  return view
    .ofType('template')
    .filter((t) => !t.deleted)
    .sort((a, b) => byCreation(b, a));
}

/**
 * List row of a template.
 * @param template - Template.
 * @param withTasks - Whether to include the task definitions.
 * @returns The row with `task_count`.
 */
export function templateRow(template: IndexedEntity, withTasks: boolean): Row {
  const row = listRow(template, { task_count: templateTasks(template).length });
  return withTasks ? row : omit(row, 'tasks');
}
