/**
 * Ranking of recalled memories (WL-16): most specific scope first (repository before global),
 * then more matched query tokens, then the most recent change, then id for a stable order.
 */
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import { text } from '../shared/rows.ts';
import { scopeRank } from './memory-rows.ts';

/** A memory with the number of query tokens it matched. */
export interface Recalled {
  /** Memory. */
  readonly memory: IndexedEntity;
  /** Distinct query tokens found. */
  readonly matched: number;
}

/**
 * Orders recalled memories best first.
 * @param items - Matches.
 * @returns A sorted copy.
 */
export function rankRecalled(items: readonly Recalled[]): Recalled[] {
  return [...items].sort(
    (a, b) =>
      scopeRank(a.memory) - scopeRank(b.memory) ||
      b.matched - a.matched ||
      compareCodeUnits(text(b.memory, 'updated_at'), text(a.memory, 'updated_at')) ||
      compareCodeUnits(a.memory.id, b.memory.id),
  );
}
