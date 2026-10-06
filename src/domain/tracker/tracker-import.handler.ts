/**
 * Imports an export: validate everything, plan new ids, then write project, epics, stories,
 * tasks, comments and notes.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { toIssues } from '../../core/mediator/behaviors/validation.behavior.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { EntityType } from '../../core/storage/entity-ref.ts';
import type { TrackerWriter } from '../shared/tracker-writer.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { cycleIssues, duplicateIdIssues } from './import-checks.ts';
import { planImport } from './import-plan.ts';
import type { PlannedEntity } from './import-plan.ts';
import { SAGA_EXPORT } from './saga-export.schema.ts';
import type { TrackerImportInput } from './tracker-import.operation.ts';

/**
 * Writes planned entities of one type.
 * @param writer - Writer.
 * @param type - Entity type.
 * @param projectId - Project.
 * @param entities - Planned entities.
 * @returns When written.
 */
async function writeAll(writer: TrackerWriter, type: EntityType, projectId: string, entities: readonly PlannedEntity[]): Promise<void> {
  for (const e of entities) {
    await writer.create({ type, id: e.id, scope: 'repo', projectId }, e.fields, e.body, `${e.label} imported`);
  }
}

/** Handles `tracker_import`. */
export class TrackerImportHandler implements OperationHandler<TrackerImportInput> {
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
   * Imports the export.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ message, project_id, project_name, counts }`.
   * @throws {WarlogError} `VALIDATION` listing every invalid record (nothing written); `NO_REPO_CONTEXT`.
   */
  async handle(input: TrackerImportInput, context: OperationContext): Promise<OperationResult> {
    const parsed = SAGA_EXPORT.safeParse(input.data);
    if (!parsed.success) {
      throw new WarlogError('VALIDATION', 'invalid export: nothing was imported', { issues: toIssues(parsed.error).map((i) => ({ ...i, path: `data.${i.path}` })) });
    }
    const duplicates = duplicateIdIssues(parsed.data);
    if (duplicates.length > 0) {
      throw new WarlogError('VALIDATION', 'invalid export: nothing was imported', { issues: duplicates });
    }
    const plan = planImport(parsed.data, context.ids, context.clock.now().toISOString());
    const cycles = cycleIssues(plan);
    if (cycles.length > 0) {
      throw new WarlogError('VALIDATION', 'invalid export: nothing was imported', { issues: cycles });
    }
    const writer = this.writers(context);
    const projectId = plan.project.id;
    await writer.create({ type: 'project', id: projectId, scope: 'repo', projectId }, plan.project.fields, plan.project.body, `${plan.project.label} imported`);
    await writeAll(writer, 'epic', projectId, plan.epics);
    await writeAll(writer, 'story', projectId, plan.stories);
    await writeAll(writer, 'task', projectId, plan.tasks);
    for (const c of plan.comments) {
      const ref = { type: 'comment' as const, id: c.id, scope: 'repo' as const, projectId, taskId: c.taskId };
      await writer.create(ref, c.fields, c.body, 'Comment imported');
      if (c.deletion !== undefined) {
        await writer.softDeleteCreated(ref, c.deletion, `Comment ${c.id} removed in the export`);
      }
    }
    await writeAll(writer, 'note', projectId, plan.notes);
    return { kind: 'object', value: { message: 'Import complete.', project_id: projectId, project_name: plan.project.fields['name'], counts: plan.counts } };
  }
}
