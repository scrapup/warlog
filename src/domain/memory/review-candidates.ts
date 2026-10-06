/**
 * Review candidates (WL-17, plan §3.7): memories nobody recalled for a period and likely
 * duplicates (same kind, at least 80 % of the title words in common). Pure over the view; a
 * review lists, it never changes anything.
 */
import type { IndexedEntity, StoreView, UsageStats } from '../../core/ports/store-view.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import { text } from '../shared/rows.ts';
import { isInPlay, liveMemories } from './memory-rows.ts';
import { tokenSet } from './token-matcher.ts';

/** Days of recall history the index keeps (also the longest review period). */
export const MAX_UNUSED_DAYS = 90;

/** Share of title words two titles must have in common to be likely duplicates. */
export const DUPLICATE_OVERLAP = 0.8;

/** Most duplicate pairs reported. */
export const MAX_DUPLICATE_PAIRS = 100;

/** Milliseconds in a day. */
const MS_PER_DAY = 86_400_000;

/** A pair of likely duplicates. */
export interface DuplicatePair {
  /** First memory (the older id). */
  readonly a: IndexedEntity;
  /** Second memory. */
  readonly b: IndexedEntity;
  /** Share of title words in common (0..1). */
  readonly overlap: number;
}

/**
 * Memories in play that were created before the period and not recalled within it.
 * @param view - View.
 * @param usage - Recall usage of the last 90 days (see `freshActivity`).
 * @param now - Current time (ms since epoch).
 * @param days - Period in days (1..90).
 * @returns Unused memories, oldest first.
 */
export function unusedMemories(view: StoreView, usage: ReadonlyMap<string, UsageStats>, now: number, days: number): IndexedEntity[] {
  const cutoff = new Date(now - days * MS_PER_DAY).toISOString();
  return liveMemories(view)
    .filter((m) => isInPlay(m) && text(m, 'created_at') < cutoff)
    .filter((m) => (usage.get(m.id)?.lastAt ?? '') < cutoff)
    .sort((a, b) => compareCodeUnits(a.id, b.id));
}

/**
 * Pairs of memories of the same kind whose titles share at least {@link DUPLICATE_OVERLAP} of
 * their words.
 * @param memories - Memories (any status; only those in play are compared).
 * @returns Pairs, most similar first, at most {@link MAX_DUPLICATE_PAIRS}.
 */
export function likelyDuplicates(memories: readonly IndexedEntity[]): DuplicatePair[] {
  const sets = new Map(memories.filter((m) => isInPlay(m)).map((m) => [m.id, { memory: m, words: tokenSet(text(m, 'title')) }] as const));
  const byWord = new Map<string, string[]>();
  for (const [id, { memory, words }] of sets) {
    words.forEach((w) => byWord.set(`${text(memory, 'kind')}\u0000${w}`, [...(byWord.get(`${text(memory, 'kind')}\u0000${w}`) ?? []), id]));
  }
  const shared = new Map<string, number>();
  for (const ids of byWord.values()) {
    ids.forEach((x, i) => ids.slice(i + 1).forEach((y) => shared.set(`${x}\u0000${y}`, (shared.get(`${x}\u0000${y}`) ?? 0) + 1)));
  }
  const pairs: DuplicatePair[] = [];
  for (const [key, common] of shared) {
    const [x, y] = key.split('\u0000') as [string, string];
    const a = sets.get(x);
    const b = sets.get(y);
    const overlap = a === undefined || b === undefined ? 0 : common / Math.max(a.words.size, b.words.size);
    if (a !== undefined && b !== undefined && overlap >= DUPLICATE_OVERLAP) {
      pairs.push({ a: a.memory, b: b.memory, overlap: Math.round(overlap * 100) / 100 });
    }
  }
  return pairs.sort((p, q) => q.overlap - p.overlap || compareCodeUnits(p.a.id, q.a.id) || compareCodeUnits(p.b.id, q.b.id)).slice(0, MAX_DUPLICATE_PAIRS);
}
