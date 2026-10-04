/**
 * How operations reach the view (plan §3.7): `full()` returns the whole index; `entity(ref)`
 * reads one entity. The MCP server keeps a live index; the CLI builds the full index only for
 * `load: full` operations and reads single files for `load: point` ones.
 */
import { WarlogError } from '../errors/warlog-error.ts';
import type { EntityRef } from '../storage/entity-ref.ts';
import type { IndexedEntity } from './indexed-entity.ts';
import type { StoreIndex } from './store-index.ts';

/** Access to the view for one call. */
export interface IndexSource {
  /**
   * The whole view.
   * @returns The index.
   * @throws {WarlogError} `INTERNAL` for an operation declared `load: point`.
   */
  full(): Promise<StoreIndex>;
  /**
   * One entity, without scanning the store.
   * @param ref - Entity reference.
   * @returns The entity, or `undefined` when absent or excluded.
   * @throws {WarlogError} `NO_REPO_CONTEXT` / `VALIDATION` for an invalid reference.
   */
  entity(ref: EntityRef): Promise<IndexedEntity | undefined>;
}

/**
 * Selects an entity from an index when it matches the reference.
 * @param index - View.
 * @param ref - Reference.
 * @returns The entity, when its type and scope match.
 */
export function entityFrom(index: StoreIndex, ref: EntityRef): IndexedEntity | undefined {
  const found = index.get(ref.id);
  return found !== undefined && found.type === ref.type && found.scope === ref.scope ? found : undefined;
}

/** Source over an index already built (MCP server: kept current by the watcher). */
export class LiveIndexSource implements IndexSource {
  /** The view. */
  private readonly index: StoreIndex;

  /**
   * Creates the source.
   * @param index - The view.
   */
  constructor(index: StoreIndex) {
    this.index = index;
  }

  /**
   * The whole view.
   * @returns The index.
   */
  async full(): Promise<StoreIndex> {
    return this.index;
  }

  /**
   * One entity from the view.
   * @param ref - Entity reference.
   * @returns The entity, when present.
   */
  async entity(ref: EntityRef): Promise<IndexedEntity | undefined> {
    return entityFrom(this.index, ref);
  }
}

/**
 * Restricts a source to point reads (enforces `load: point`, plan §3.7).
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
