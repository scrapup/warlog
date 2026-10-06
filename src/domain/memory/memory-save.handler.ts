/**
 * Creates or updates a memory (`memories/<id>.md` at repository or global scope).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { ALL_KIND_FIELDS, checkKindFields, checkKindPatch } from './memory.schema.ts';
import type { MemoryKind, MemoryScope } from './memory.schema.ts';
import type { MemorySaveInput } from './memory-save.operation.ts';

/**
 * Kind-specific fields present in the input.
 * @param input - Input.
 * @returns The fields.
 */
function kindFieldsOf(input: MemorySaveInput): Record<string, unknown> {
  const record: Record<string, unknown> = { ...input };
  return Object.fromEntries(ALL_KIND_FIELDS.filter((f) => record[f] !== undefined).map((f) => [f, record[f]]));
}

/**
 * Fails when a required creation field is missing.
 * @param input - Input.
 * @throws {WarlogError} `VALIDATION` listing the missing fields.
 */
function assertCreatable(input: MemorySaveInput): void {
  const missing = (['kind', 'title', 'content'] as const).filter((f) => input[f] === undefined);
  if (missing.length > 0) {
    throw new WarlogError('VALIDATION', `${missing.join(', ')} required to create a memory`, { issues: missing.map((path) => ({ path, message: 'is required on creation' })) });
  }
}

/** Handles `memory_save`. */
export class MemorySaveHandler implements OperationHandler<MemorySaveInput> {
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
   * Saves the memory.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The memory.
   * @throws {WarlogError} `VALIDATION` (missing or misplaced fields, duplicate command, changed kind or scope); `NOT_FOUND`; `NO_REPO_CONTEXT`; `CONFLICT`.
   */
  async handle(input: MemorySaveInput, context: OperationContext): Promise<OperationResult> {
    return input.id === undefined ? this.create(input, context) : this.update(input, input.id, context);
  }

  /**
   * Creates a memory.
   * @param input - Input.
   * @param context - Call context.
   * @returns The memory.
   * @throws {WarlogError} See {@link MemorySaveHandler.handle}.
   */
  private async create(input: MemorySaveInput, context: OperationContext): Promise<OperationResult> {
    assertCreatable(input);
    const kind = input.kind as MemoryKind;
    const scope: MemoryScope = input.scope ?? (context.roots.repository === undefined ? 'global' : 'repo');
    const fields = checkKindFields(kind, kindFieldsOf(input));
    if (kind === 'command') {
      await this.assertNewCommand(context, scope, String(fields['cmd']));
    }
    const record = await this.writers(context).create(
      { type: 'memory', id: context.ids.next(), scope },
      { scope, kind, title: input.title, status: 'active', ...fields, tags: input.tags ?? [] },
      input.content ?? '',
      `Memory '${String(input.title)}' (${kind}) saved at ${scope} scope`,
    );
    return { kind: 'object', value: entityRow(record, 'content') };
  }

  /**
   * Fails when a command memory with the same command line exists in the scope.
   * @param context - Call context.
   * @param scope - Scope.
   * @param cmd - Command line.
   * @throws {WarlogError} `VALIDATION` naming the existing memory.
   */
  private async assertNewCommand(context: OperationContext, scope: MemoryScope, cmd: string): Promise<void> {
    const existing = (await context.index.full()).ofType('memory').find((m) => !m.deleted && m.scope === scope && text(m, 'kind') === 'command' && text(m, 'cmd') === cmd);
    if (existing !== undefined) {
      throw new WarlogError('VALIDATION', `a command memory for this command already exists at ${scope} scope: ${existing.id}`, { field: 'cmd', holder: existing.id });
    }
  }

  /**
   * Updates a memory's fields (kind, scope and status never change here).
   * @param input - Input.
   * @param id - Memory id.
   * @param context - Call context.
   * @returns The memory.
   * @throws {WarlogError} See {@link MemorySaveHandler.handle}.
   */
  private async update(input: MemorySaveInput, id: string, context: OperationContext): Promise<OperationResult> {
    const memory = await requireEntity(context.index, 'memory', id);
    const kind = text(memory, 'kind') as MemoryKind;
    for (const field of ['kind', 'scope'] as const) {
      if (input[field] !== undefined && input[field] !== text(memory, field)) {
        throw new WarlogError('VALIDATION', `${field} cannot change after creation`, { issues: [{ path: field, message: 'cannot change after creation' }] });
      }
    }
    const kindFields = kindFieldsOf(input);
    checkKindPatch(kind, kindFields);
    const patch = { ...kindFields, ...(input.title === undefined ? {} : { title: input.title }), ...(input.tags === undefined ? {} : { tags: input.tags }) };
    if (Object.keys(patch).length === 0 && input.content === undefined) {
      throw new WarlogError('VALIDATION', 'No fields to update', { fields: ['title', 'content', 'tags', ...ALL_KIND_FIELDS] });
    }
    const record = await this.writers(context).update(memory, input.content === undefined ? { patch } : { patch, body: input.content }, [
      { action: 'updated', summary: `Memory '${String(input.title ?? text(memory, 'title'))}' updated` },
    ]);
    return { kind: 'object', value: entityRow(record, 'content') };
  }
}
