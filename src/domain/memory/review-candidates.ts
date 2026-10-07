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

/** Most candidate pairs compared in one review; a title shared by thousands of memories cannot make it quadratic. */
export const MAX_DUPLICATE_CHECKS = 200_000;

/** A memory in play with the words of its title. */
interface Titled {
  /** The memory. */
  readonly memory: IndexedEntity;
  /** Kind (only memories of one kind are compared). */
  readonly kind: string;
  /** Distinct words of the title, rarest first. */
  readonly words: string[];
}

/**
 * Memories in play with their title words, each ordered from the rarest word of its kind to the
 * most common (ties by word).
 * @param memories - Memories (any status).
 * @returns The titled memories.
 */
function titled(memories: readonly IndexedEntity[]): Titled[] {
  const items = memories.filter((m) => isInPlay(m)).map((memory) => ({ memory, kind: text(memory, 'kind'), words: [...tokenSet(text(memory, 'title'))] }));
  const frequency = new Map<string, number>();
  for (const { kind, words } of items) {
    words.forEach((w) => frequency.set(`${kind}\u0000${w}`, (frequency.get(`${kind}\u0000${w}`) ?? 0) + 1));
  }
  items.forEach((i) => i.words.sort((x, y) => (frequency.get(`${i.kind}\u0000${x}`) ?? 0) - (frequency.get(`${i.kind}\u0000${y}`) ?? 0) || compareCodeUnits(x, y)));
  return items;
}

/**
 * Indexes the rarest words of every title: two titles with at least {@link DUPLICATE_OVERLAP} of
 * their words in common must share one of the rarest `n - ceil(0.8 n) + 1` words of each (prefix
 * filtering), so only those words are indexed. Words common to many memories are rarely indexed,
 * which keeps the cost independent of how many titles share them.
 * @param items - Titled memories.
 * @returns Indexes into `items`, by kind and word.
 */
function indexPrefixes(items: readonly Titled[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  items.forEach((item, i) => {
    const prefix = item.words.length - Math.ceil(DUPLICATE_OVERLAP * item.words.length) + 1;
    item.words.slice(0, prefix).forEach((w) => {
      const key = `${item.kind}\u0000${w}`;
      index.set(key, pushed(index.get(key), i));
    });
  });
  return index;
}

/**
 * Appends to a bucket (creating it when missing) without copying it.
 * @param bucket - Existing bucket.
 * @param value - Value to append.
 * @returns The bucket.
 */
function pushed(bucket: number[] | undefined, value: number): number[] {
  const out = bucket ?? [];
  out.push(value);
  return out;
}

/**
 * Candidate pairs: every two memories that share an indexed word, each pair once.
 * @param items - Titled memories.
 * @returns Pairs of indexes into `items`, at most {@link MAX_DUPLICATE_CHECKS}.
 */
function candidatePairs(items: readonly Titled[]): [number, number][] {
  const seen = new Set<number>();
  const pairs: [number, number][] = [];
  for (const bucket of indexPrefixes(items).values()) {
    for (let x = 0; x < bucket.length; x += 1) {
      for (let y = x + 1; y < bucket.length; y += 1) {
        const pair: [number, number] = [bucket[x] ?? 0, bucket[y] ?? 0];
        const key = pair[0] * items.length + pair[1];
        if (pairs.length >= MAX_DUPLICATE_CHECKS) {
          return pairs;
        }
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push(pair);
        }
      }
    }
  }
  return pairs;
}

/**
 * Pairs of memories of the same kind whose titles share at least {@link DUPLICATE_OVERLAP} of
 * their words. The search is bounded ({@link MAX_DUPLICATE_CHECKS}): a review lists likely
 * duplicates, it does not promise every one.
 * @param memories - Memories (any status; only those in play are compared).
 * @returns Pairs, most similar first, at most {@link MAX_DUPLICATE_PAIRS}.
 */
export function likelyDuplicates(memories: readonly IndexedEntity[]): DuplicatePair[] {
  const items = titled(memories);
  const found: DuplicatePair[] = [];
  for (const [x, y] of candidatePairs(items)) {
    const a = items[x];
    const b = items[y];
    const words = b === undefined ? new Set<string>() : new Set(b.words);
    const common = a === undefined ? 0 : a.words.filter((w) => words.has(w)).length;
    const overlap = a === undefined || b === undefined ? 0 : common / Math.max(a.words.length, b.words.length);
    if (a !== undefined && b !== undefined && overlap >= DUPLICATE_OVERLAP) {
      const [first, second] = compareCodeUnits(a.memory.id, b.memory.id) <= 0 ? [a, b] : [b, a];
      found.push({ a: first.memory, b: second.memory, overlap: Math.round(overlap * 100) / 100 });
    }
  }
  return found.sort((p, q) => q.overlap - p.overlap || compareCodeUnits(p.a.id, q.a.id) || compareCodeUnits(p.b.id, q.b.id)).slice(0, MAX_DUPLICATE_PAIRS);
}
