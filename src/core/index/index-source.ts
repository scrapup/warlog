/**
 * Index sources (plan §3.7): `full()` returns the whole view; `entity(ref)` reads one entity.
 * The contract lives in the store-view port; these are the shared building blocks.
 */
import { WarlogError } from '../errors/warlog-error.ts';
import type { IndexSource, IndexedEntity, StoreView } from '../ports/store-view.port.ts';
import type { EntityRef } from '../storage/entity-ref.ts';

export type { IndexSource } from '../ports/store-view.port.ts';

/**
 * Selects an entity from a view when it matches the reference.
 * @param view - View.
 * @param ref - Reference.
 * @returns The entity, when its type and scope match.
 */
export function entityFrom(view: StoreView, ref: EntityRef): IndexedEntity | undefined {
  const found = view.get(ref.id);
  return found !== undefined && found.type === ref.type && found.scope === ref.scope ? found : undefined;
}

/** Source over a view already built. */
export class LiveIndexSource implements IndexSource {
  /** The view. */
  private readonly view: StoreView;

  /**
   * Creates the source.
   * @param view - The view.
   */
  constructor(view: StoreView) {
    this.view = view;
  }

  /**
   * The whole view.
   * @returns The view.
   */
  async full(): Promise<StoreView> {
    return this.view;
  }

  /**
   * One entity from the view.
   * @param ref - Entity reference.
   * @returns The entity, when present.
   */
  async entity(ref: EntityRef): Promise<IndexedEntity | undefined> {
    return entityFrom(this.view, ref);
  }
}

/**
 * Restricts a source to point reads (enforces `load: point` in both interfaces, plan §3.7).
 * @param source - Source.
 * @param operation - Operation name, for the error.
 * @returns A source whose `full()` fails.
 */
export function pointOnly(source: IndexSource, operation: string): IndexSource {
  return {
    full: async () => {
      throw new WarlogError('INTERNAL', `operation ${operation} is declared load: point but requested the full index`, { operation });
    },
    entity: (ref) => source.entity(ref),
  };
}
