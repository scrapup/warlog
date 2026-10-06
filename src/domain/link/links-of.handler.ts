/**
 * Lists the links of an entity in both directions.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { StoreView } from '../../core/ports/store-view.port.ts';
import type { Row } from '../shared/rows.ts';
import { linksOfEntity } from './link-store.ts';
import { LINK_RELATIONS, parseLinkTarget } from './link-target-parser.ts';
import type { LinksOfInput } from './links-of.operation.ts';
import { entityBrief, targetBrief } from './node-label.ts';

/**
 * Links pointing at a target (typed links only; dependencies are not links).
 * @param view - View.
 * @param target - Entity id or reference.
 * @returns Rows `{ direction: 'in', rel, …source brief }`.
 */
function incoming(view: StoreView, target: string): Row[] {
  return view
    .backlinksOf(target)
    .flatMap((source) => linksOfEntity(source).filter((l) => l.target === target && (LINK_RELATIONS as readonly string[]).includes(l.rel)).map((l) => ({ direction: 'in', rel: l.rel, ...entityBrief(source) })));
}

/** Handles `links_of`. */
export class LinksOfHandler implements OperationHandler<LinksOfInput> {
  /**
   * Lists the links.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The rows, outgoing first.
   * @throws {WarlogError} `NOT_FOUND` for an unknown entity id.
   */
  async handle(input: LinksOfInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const kind = parseLinkTarget(input.id)?.kind;
    const entity = kind === 'entity' ? view.get(input.id) : undefined;
    if (kind === 'entity' && entity === undefined && view.backlinksOf(input.id).length === 0) {
      throw new WarlogError('NOT_FOUND', `entity ${input.id} not found`, { id: input.id });
    }
    const out = entity === undefined || input.direction === 'in' ? [] : linksOfEntity(entity).map((l) => ({ direction: 'out', rel: l.rel, ...targetBrief(view, l.target) }));
    return { kind: 'list', rows: [...out, ...(input.direction === 'out' ? [] : incoming(view, input.id))] };
  }
}
