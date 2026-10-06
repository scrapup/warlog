/**
 * Resolves a known issue.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { MAX_LINKS, hasLink, linksOfEntity } from '../link/link-store.ts';
import type { StoredLink } from '../link/link-store.ts';
import { parseLinkTarget } from '../link/link-target-parser.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { IssueResolveInput } from './issue-resolve.operation.ts';

/**
 * Adds the reference given to `issue_resolve` to the links of the memory, under the rules of
 * `link_add`: a valid target (a bare https URL gets its `url:` prefix), no duplicates, at most
 * {@link MAX_LINKS} links. Anything else would be stored where `link_remove`, `links_of` and
 * `trace` cannot reach it.
 * @param links - Links the memory has.
 * @param reference - What the caller gave.
 * @returns The links to store.
 * @throws {WarlogError} `VALIDATION` when the reference is not a valid link target or the memory has too many links.
 */
function withReference(links: readonly StoredLink[], reference: string): StoredLink[] {
  const target = [reference, `url:${reference}`].find((candidate) => parseLinkTarget(candidate) !== undefined);
  if (target === undefined) {
    throw new WarlogError('VALIDATION', 'link must be an entity id, spec:, git:, test:, file: or url: reference, or an https URL', { field: 'link' });
  }
  if (hasLink(links, 'relates', target)) {
    return [...links];
  }
  if (links.length >= MAX_LINKS) {
    throw new WarlogError('VALIDATION', `a memory holds at most ${MAX_LINKS} links`, { field: 'link' });
  }
  return [...links, { rel: 'relates', target }];
}

/** Handles `issue_resolve`. */
export class IssueResolveHandler implements OperationHandler<IssueResolveInput> {
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
   * Resolves the issue.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The memory.
   * @throws {WarlogError} `NOT_FOUND`; `VALIDATION` when it is not an open known issue; `CONFLICT`.
   */
  async handle(input: IssueResolveInput, context: OperationContext): Promise<OperationResult> {
    const memory = await requireEntity(context.index, 'memory', input.id);
    if (text(memory, 'kind') !== 'known_issue') {
      throw new WarlogError('VALIDATION', `memory ${memory.id} is a ${text(memory, 'kind')}, not a known_issue`, { field: 'id' });
    }
    if (text(memory, 'issue_status') === 'resolved') {
      throw new WarlogError('VALIDATION', `known issue ${memory.id} is already resolved`, { field: 'id' });
    }
    const patch = { issue_status: 'resolved', resolution: input.resolution, ...(input.link === undefined ? {} : { links: withReference(linksOfEntity(memory), input.link) }) };
    const record = await this.writers(context).update(memory, { patch }, [
      { action: 'updated', summary: `Known issue '${text(memory, 'title')}' resolved`, extra: { field: 'issue_status', old_value: 'open', new_value: 'resolved' } },
    ]);
    return { kind: 'object', value: entityRow(record, 'content') };
  }
}
