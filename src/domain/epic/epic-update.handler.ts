/**
 * Updates an epic; `branch` is resolved like on creation (`"current"`; `""` stores `null`, branch-agnostic).
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { changeEvents, changeFrom } from '../shared/changes.ts';
import type { ChangeSpec } from '../shared/changes.ts';
import { requireEntity, resolveBranch } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { EpicUpdateInput } from './epic-update.operation.ts';

/** Field mapping of an epic update. */
const SPEC: ChangeSpec = {
  fields: ['name', 'status', 'priority', 'sort_order', 'branch', 'tags'],
  bodyField: 'description',
  tracked: ['name', 'status', 'priority', 'branch'],
};

/** Handles `epic_update`. */
export class EpicUpdateHandler implements OperationHandler<EpicUpdateInput> {
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
   * Applies the change.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The updated epic.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` when nothing is set; `CONFLICT`.
   */
  async handle(input: EpicUpdateInput, context: OperationContext): Promise<OperationResult> {
    const epic = await requireEntity(context.index, 'epic', input.id);
    const branch = input.branch === undefined ? undefined : await resolveBranch(context, input.branch);
    const change = changeFrom({ ...input, branch }, SPEC);
    const label = `epic '${String(change.patch['name'] ?? text(epic, 'name'))}'`;
    const record = await this.writers(context).update(epic, change, changeEvents(label, epic.record, change.patch, SPEC.tracked));
    return { kind: 'object', value: entityRow(record) };
  }
}
