/**
 * Breadth-first walk of the traceability graph (WL-22, WL-44): from a node, over typed links in
 * both directions, the hierarchy (project → epic → story → task) and the external references
 * (Jira/ClickUp keys) of epics, stories and tasks. A visited set handles cycles; pending targets
 * appear as leaves; the walk stops at {@link MAX_TRACE_NODES}.
 */
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { text } from '../shared/rows.ts';
import { linksOfEntity } from './link-store.ts';
import { LINK_RELATIONS, parseLinkTarget } from './link-target-parser.ts';
import { entityBrief, targetBrief } from './node-label.ts';
import type { Row } from '../shared/rows.ts';

/** Default trace depth. */
export const DEFAULT_TRACE_DEPTH = 3;

/** Largest trace depth. */
export const MAX_TRACE_DEPTH = 6;

/** Most nodes a trace visits. */
export const MAX_TRACE_NODES = 2_000;

/** Parent fields followed upward (child → parent). */
const PARENT_FIELDS = ['story_id', 'epic_id', 'project_id'] as const;

/** One step of the walk. */
export interface TraceRow {
  /** Distance from the root. */
  readonly depth: number;
  /** Relation of the edge (`implements`, …, `parent`, `child`, `external`). */
  readonly rel: string;
  /** `out` (the source holds the edge), `in` (the node points at the source) or `hierarchy` / `external`. */
  readonly direction: string;
  /** Node the edge starts from. */
  readonly from: string;
  /** Node reached. */
  readonly node: Row;
}

/** Result of a walk. */
export interface TraceResult {
  /** Rows in visiting order. */
  readonly rows: TraceRow[];
  /** Whether the node limit cut the walk. */
  readonly truncated: boolean;
}

/** An edge found from a node. */
interface Edge {
  /** Relation. */
  readonly rel: string;
  /** Direction label. */
  readonly direction: string;
  /** Key of the node reached (entity id or reference text, `external:<system>:<key>`). */
  readonly key: string;
  /** Brief of the node reached. */
  readonly node: Row;
}

/** An external reference. */
export interface ExternalRef {
  /** System (jira, clickup, …). */
  readonly system: string;
  /** Key in that system. */
  readonly key: string;
}

/**
 * External references (`external` field) of an entity.
 * @param entity - Entity.
 * @returns `{ system, key, url? }` entries.
 */
function externalsOf(entity: IndexedEntity): ExternalRef[] {
  const external = entity.record.data['external'];
  return Array.isArray(external) ? external.filter((e: unknown): e is ExternalRef => typeof e === 'object' && e !== null && typeof Reflect.get(e, 'system') === 'string' && typeof Reflect.get(e, 'key') === 'string') : [];
}

/**
 * Edges of an entity: its links, its backlinks, its parents and children, its external references.
 * @param view - View.
 * @param entity - Entity.
 * @returns The edges.
 */
function entityEdges(view: StoreView, entity: IndexedEntity): Edge[] {
  const out = linksOfEntity(entity).filter((l) => (LINK_RELATIONS as readonly string[]).includes(l.rel)).map((l) => ({ rel: l.rel, direction: 'out', key: l.target, node: targetBrief(view, l.target) }));
  const back = referencesTo(view, entity.id);
  const parents = PARENT_FIELDS.map((f) => text(entity, f)).filter((id) => id !== '' && id !== entity.id && view.get(id) !== undefined).map((id) => ({ rel: 'parent', direction: 'hierarchy', key: id, node: targetBrief(view, id) }));
  const children = view.childrenOf(entity.id).filter((c) => c.type !== 'comment' && c.type !== 'note').map((c) => ({ rel: 'child', direction: 'hierarchy', key: c.id, node: entityBrief(c) }));
  const externals = externalsOf(entity).map((e) => ({ rel: 'external', direction: 'external', key: `external:${e.system}:${e.key}`, node: { id: `${e.system}:${e.key}`, type: 'external', label: `${e.system} ${e.key}` } }));
  return [...out, ...back, ...parents, ...children, ...externals];
}

/**
 * Edges of entities linking to a target.
 * @param view - View.
 * @param target - Entity id or reference.
 * @returns The edges (`in` direction).
 */
function referencesTo(view: StoreView, target: string): Edge[] {
  return view
    .backlinksOf(target)
    .flatMap((source) => linksOfEntity(source).filter((l) => l.target === target && (LINK_RELATIONS as readonly string[]).includes(l.rel)).map((l) => ({ rel: l.rel, direction: 'in', key: source.id, node: entityBrief(source) })));
}

/**
 * Edges of a node key.
 * @param view - View.
 * @param key - Entity id, reference text or `external:…`.
 * @returns The edges (references expand only to what links to them).
 */
function edgesOf(view: StoreView, key: string): Edge[] {
  const entity = parseLinkTarget(key)?.kind === 'entity' ? view.get(key) : undefined;
  if (entity !== undefined) {
    return entityEdges(view, entity);
  }
  return key.startsWith('external:') ? [] : referencesTo(view, key);
}

/**
 * Walks the graph from a root.
 * @param view - View.
 * @param root - Root node key (entity id or reference).
 * @param depth - Maximum distance (1..{@link MAX_TRACE_DEPTH}).
 * @returns The rows and whether the walk was cut.
 */
export function walkTrace(view: StoreView, root: string, depth: number): TraceResult {
  const seen = new Set<string>([root]);
  const rows: TraceRow[] = [];
  let frontier = [root];
  for (let level = 1; level <= depth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const from of frontier) {
      for (const edge of edgesOf(view, from)) {
        if (seen.has(edge.key)) {
          continue;
        }
        if (seen.size >= MAX_TRACE_NODES) {
          return { rows, truncated: true };
        }
        seen.add(edge.key);
        rows.push({ depth: level, rel: edge.rel, direction: edge.direction, from, node: edge.node });
        next.push(edge.key);
      }
    }
    frontier = next;
  }
  return { rows, truncated: false };
}
