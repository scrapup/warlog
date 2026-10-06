/**
 * Creates or updates a note. A new note is stored in the project of its related entity
 * (`projects/<p>/notes/`), otherwise at the repository level (`notes/`); a related entity not
 * present yet stays a pending reference (WL-44). The file never moves after creation.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { StoreView } from '../../core/ports/store-view.port.ts';
import { requireInView } from '../shared/lookup.ts';
import { entityRow } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { NoteSaveInput } from './note-save.operation.ts';

/** Front-matter fields of a note. */
const NOTE_FIELDS = ['title', 'note_type', 'related_entity_type', 'related_entity_id', 'tags'] as const;

/**
 * Project of a note's related entity.
 * @param view - View.
 * @param input - Input.
 * @returns The project id, when the related entity is known.
 */
function relatedProject(view: StoreView, input: NoteSaveInput): string | undefined {
  const related = input.related_entity_id === undefined ? undefined : view.get(input.related_entity_id);
  return related?.type === input.related_entity_type ? related?.projectId : undefined;
}

/** Handles `note_save`. */
export class NoteSaveHandler implements OperationHandler<NoteSaveInput> {
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
   * Saves the note.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The note.
   * @throws {WarlogError} `NOT_FOUND` for an unknown id; `NO_REPO_CONTEXT`; `CONFLICT`.
   */
  async handle(input: NoteSaveInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const fields = Object.fromEntries(NOTE_FIELDS.filter((f) => input[f] !== undefined).map((f) => [f, input[f]]));
    const writer = this.writers(context);
    if (input.id !== undefined) {
      const note = requireInView(view, 'note', input.id);
      const record = await writer.update(note, { patch: fields, body: input.content }, [{ action: 'updated', summary: `Note '${input.title}' updated` }]);
      return { kind: 'object', value: entityRow(record, 'content') };
    }
    const projectId = relatedProject(view, input);
    const record = await writer.create(
      { type: 'note', id: context.ids.next(), scope: 'repo', ...(projectId === undefined ? {} : { projectId }) },
      { ...(projectId === undefined ? {} : { project_id: projectId }), note_type: 'general', ...fields, tags: input.tags ?? [] },
      input.content,
      `Note '${input.title}' created`,
    );
    return { kind: 'object', value: entityRow(record, 'content') };
  }
}
