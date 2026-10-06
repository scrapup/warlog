/**
 * Resolves a known issue.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import { requireEntity } from '../shared/lookup.ts';
import { entityRow, text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { IssueResolveInput } from './issue-resolve.operation.ts';

/** Prefixes of link targets (plan §3.2); anything else is taken as a URL. */
const LINK_PREFIXES = ['spec:', 'git:', 'test:', 'file:', 'url:'];

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
    const links = Array.isArray(memory.record.data['links']) ? memory.record.data['links'] : [];
    const patch = {
      issue_status: 'resolved',
      resolution: input.resolution,
      ...(input.link === undefined ? {} : { links: [...links, { rel: 'relates', target: LINK_PREFIXES.some((p) => input.link?.startsWith(p)) ? input.link : `url:${String(input.link)}` }] }),
    };
    const record = await this.writers(context).update(memory, { patch }, [
      { action: 'updated', summary: `Known issue '${text(memory, 'title')}' resolved`, extra: { field: 'issue_status', old_value: 'open', new_value: 'resolved' } },
    ]);
    return { kind: 'object', value: entityRow(record, 'content') };
  }
}
