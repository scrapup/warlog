/**
 * Memory shapes and selections shared by the memory and playbook operations.
 */
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import { byCreation, listRow, tagsOf, text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { excerpt } from '../shared/text-search.ts';
import type { MemoryScope } from './memory.schema.ts';

/** Statuses a memory is in play with (recalled, listed, in the playbook). */
const IN_PLAY = new Set(['active', 'stale']);

/**
 * Scope of a memory.
 * @param memory - Memory.
 * @returns `repo` or `global`.
 */
export function scopeOfMemory(memory: IndexedEntity): MemoryScope {
  return memory.scope === 'repo' ? 'repo' : 'global';
}

/**
 * Specificity of a scope (WL-16): the repository before the global root.
 * @param memory - Memory.
 * @returns `0` for repository, `1` for global.
 */
export function scopeRank(memory: IndexedEntity): number {
  return memory.scope === 'repo' ? 0 : 1;
}

/**
 * Tells whether a memory takes part in recall, listings and the playbook.
 * @param memory - Memory.
 * @returns `true` for active and stale memories that are not deleted.
 */
export function isInPlay(memory: IndexedEntity): boolean {
  return !memory.deleted && IN_PLAY.has(text(memory, 'status'));
}

/**
 * Live memories of both scopes.
 * @param view - View.
 * @returns Memories (any status), ordered by id.
 */
export function liveMemories(view: StoreView): IndexedEntity[] {
  return view.ofType('memory').filter((m) => !m.deleted);
}

/**
 * Orders memories by scope specificity, then newest change first, then id.
 * @param a - First.
 * @param b - Second.
 * @returns Comparison.
 */
export function bySpecificityThenRecency(a: IndexedEntity, b: IndexedEntity): number {
  return scopeRank(a) - scopeRank(b) || compareCodeUnits(text(b, 'updated_at'), text(a, 'updated_at')) || byCreation(b, a);
}

/** Fields shown in list rows besides the common ones. */
const ROW_FIELDS = ['cmd', 'purpose', 'issue_status', 'applies_to', 'symptom'] as const;

/**
 * List row of a memory: no body, an excerpt instead (WL-38).
 * @param memory - Memory.
 * @param extra - Computed fields.
 * @returns The row.
 */
export function memoryRow(memory: IndexedEntity, extra: Row = {}): Row {
  const data = memory.record.data;
  return {
    id: memory.id,
    scope: scopeOfMemory(memory),
    kind: text(memory, 'kind'),
    title: text(memory, 'title'),
    status: text(memory, 'status'),
    ...Object.fromEntries(ROW_FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]])),
    ...(tagsOf(memory).length === 0 ? {} : { tags: tagsOf(memory) }),
    ...(memory.record.body === '' ? {} : { excerpt: excerpt(memory.record.body) }),
    updated_at: data['updated_at'],
    ...extra,
  };
}

/**
 * Searchable text of a memory: title, body, tags and the text fields of its kind.
 * @param memory - Memory.
 * @returns The text.
 */
export function searchableText(memory: IndexedEntity): string {
  const data = memory.record.data;
  const fields = ['title', 'cmd', 'purpose', 'symptom', 'cause', 'workaround', 'known_error', 'resolution', 'example'].map((f) => text(memory, f));
  const applies = Array.isArray(data['applies_to']) ? data['applies_to'].map(String) : [];
  return [...fields, ...applies, ...tagsOf(memory), memory.record.body].join('\n');
}

/**
 * Full row of a memory (all front-matter fields and the content).
 * @param memory - Memory.
 * @returns The row.
 */
export function memoryFull(memory: IndexedEntity): Row {
  return { ...listRow(memory), ...(memory.record.body === '' ? {} : { content: memory.record.body }) };
}
