/**
 * Listing the document registry (WL-59, WL-64, WL-67): epics, opportunities, documents, the
 * history timeline and the kept versions of a document, sorted and filtered by their dates.
 */
import { z } from 'zod';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import { DocReader } from './doc-reader.ts';
import type { DocRepository, DocRepositoryFactory } from './doc.repository.ts';
import { AREA_FIELD, DOC_SLUG, KIND_FIELD, ORDER_FIELD, SORT_FIELD } from './doc.schema.ts';
import type { DocArea, DocKind } from './doc.schema.ts';

/** Date filters shared by the listings. */
const DATES = {
  since: z.string().optional().describe('Only entries changed at or after this ISO date'),
  until: z.string().optional().describe('Only entries changed at or before this ISO date'),
};

/** Sorting shared by the listings. */
const SORTING = { sort_by: SORT_FIELD, order: ORDER_FIELD };

/** `doc_list` input. */
const LIST_INPUT = z.object({ area: AREA_FIELD.optional(), epic: DOC_SLUG.optional(), opportunity: DOC_SLUG.optional(), kind: KIND_FIELD.optional(), ...DATES, ...SORTING });

/** `doc_history` input. */
const HISTORY_INPUT = z.object({ area: AREA_FIELD.optional(), epic: DOC_SLUG.optional(), opportunity: DOC_SLUG.optional(), ...DATES, order: ORDER_FIELD });

/** `doc_versions` input. */
const VERSIONS_INPUT = z.object({ id: z.string().min(1).describe('Document id') });

/** `doc_epic_list` input. */
const EPIC_LIST_INPUT = z.object({ area: AREA_FIELD.optional(), ...DATES, ...SORTING });

/** `opportunity_list` input. */
const OPPORTUNITY_LIST_INPUT = z.object({ area: AREA_FIELD.optional(), epic: DOC_SLUG.optional(), ...DATES, ...SORTING });

/** A dated row. */
interface Dated {
  /** Inclusion date. */
  readonly created_at: string;
  /** Last change. */
  readonly updated_at: string;
  /** Other columns. */
  readonly [column: string]: unknown;
}

/** Date filters and sorting of a listing. */
interface Arrangement {
  /** Earliest change. */
  readonly since?: string | undefined;
  /** Latest change. */
  readonly until?: string | undefined;
  /** Sort key. */
  readonly sort_by?: 'created_at' | 'updated_at';
  /** Sort order. */
  readonly order: 'asc' | 'desc';
}

/** Which documents to list. */
interface DocumentFilter {
  /** Area. */
  readonly area?: DocArea | undefined;
  /** Epic slug. */
  readonly epic?: string | undefined;
  /** Opportunity slug. */
  readonly opportunity?: string | undefined;
  /** Kind. */
  readonly kind?: DocKind | undefined;
}

/** Metadata of a kept version, as far as listings read it. */
interface KeptMeta {
  /** Last change. */
  readonly updated_at?: string;
  /** Size. */
  readonly bytes?: number;
}

/**
 * Areas to list.
 * @param repo - Document repository.
 * @param area - Requested area, when any.
 * @returns The areas.
 */
function areasOf(repo: DocRepository, area: DocArea | undefined): DocArea[] {
  return area === undefined ? repo.areas() : [area];
}

/**
 * Filters rows by date and sorts them.
 * @param rows - Rows.
 * @param opts - Date filters and sorting.
 * @returns The rows.
 */
function arrange(rows: readonly Dated[], opts: Arrangement): Dated[] {
  const key = opts.sort_by ?? 'updated_at';
  const kept = rows.filter((r) => (opts.since === undefined || r.updated_at >= opts.since) && (opts.until === undefined || r.updated_at <= opts.until));
  const sorted = [...kept].sort((a, b) => compareCodeUnits(a[key], b[key]));
  return opts.order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Document rows of the areas.
 * @param repo - Document repository.
 * @param input - Filters.
 * @returns The rows.
 */
async function documentRows(repo: DocRepository, input: DocumentFilter): Promise<Dated[]> {
  const nested = await Promise.all(areasOf(repo, input.area).map((a) => repo.documents(a, input.epic, input.opportunity, input.kind)));
  return nested.flat().map((d) => ({ id: d.meta.id, area: d.area, epic: d.epic, opportunity: d.opportunity, kind: d.kind, title: d.meta.title, mode: d.meta.mode, version: d.meta.version, bytes: d.meta.bytes, created_at: d.meta.created_at, updated_at: d.meta.updated_at }));
}

/**
 * Builds `doc_list`.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function docListOperation(docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_list',
    group: 'doc',
    action: 'list',
    kind: 'query',
    input: LIST_INPUT,
    description: 'List registered documents with their dates, filtered by area, epic, opportunity, kind and change date, sorted by inclusion or last change.',
    examples: [{ epic: 'warlog', kind: 'spec' }],
    defaultFormat: 'table',
    load: 'point',
    handler: {
      async handle(input: z.infer<typeof LIST_INPUT>, context: OperationContext): Promise<OperationResult> {
        return { kind: 'list', rows: arrange(await documentRows(docs(context), input), input) };
      },
    },
  };
}

/**
 * Builds `doc_history`.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function docHistoryOperation(docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_history',
    group: 'doc',
    action: 'history',
    kind: 'query',
    input: HISTORY_INPUT,
    description: 'Timeline of document changes, newest first by default, filtered by area, epic, opportunity and date range.',
    examples: [{ epic: 'warlog', since: '2026-10-01T00:00:00Z' }],
    defaultFormat: 'table',
    load: 'point',
    handler: {
      async handle(input: z.infer<typeof HISTORY_INPUT>, context: OperationContext): Promise<OperationResult> {
        const rows = arrange(await documentRows(docs(context), input), { ...input, sort_by: 'updated_at' });
        return { kind: 'list', rows: rows.map((r) => ({ at: r['updated_at'], id: r['id'], epic: r['epic'], opportunity: r['opportunity'], kind: r['kind'], title: r['title'], version: r['version'] })) };
      },
    },
  };
}

/**
 * Builds `doc_versions`.
 * @param fs - File system.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function docVersionsOperation(fs: FileSystem, docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_versions',
    group: 'doc',
    action: 'versions',
    kind: 'query',
    input: VERSIONS_INPUT,
    description: 'Versions of a document: the current one and the immutable versions kept by doc_import with version=true.',
    examples: [{ id: '01J0000000000000000000000A' }],
    defaultFormat: 'table',
    load: 'point',
    positional: 'id',
    handler: {
      async handle(input: z.infer<typeof VERSIONS_INPUT>, context: OperationContext): Promise<OperationResult> {
        const repo = docs(context);
        const found = await new DocReader(fs, repo).find(input.id);
        const root = await repo.paths.inOpp(found, 'versions', found.kind);
        const numbers = (await fs.readDir(root)).map(Number).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
        const kept = await Promise.all(numbers.map(async (n) => ({ n, meta: await repo.readYaml(`${root}/${n}/meta.yaml`) as KeptMeta | undefined })));
        const rows = [...kept.map((k) => ({ version: k.n, current: false, updated_at: k.meta?.updated_at ?? '', bytes: k.meta?.bytes ?? 0 })), { version: found.meta.version, current: true, updated_at: found.meta.updated_at, bytes: found.meta.bytes }];
        return { kind: 'list', rows };
      },
    },
  };
}

/**
 * Builds `doc_epic_list`.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function docEpicListOperation(docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_epic_list',
    group: 'doc',
    action: 'epic-list',
    kind: 'query',
    input: EPIC_LIST_INPUT,
    description: 'List documentation epics (categories of documents, distinct from execution epics) with their dates.',
    examples: [{ area: 'repo' }],
    defaultFormat: 'table',
    load: 'point',
    handler: {
      async handle(input: z.infer<typeof EPIC_LIST_INPUT>, context: OperationContext): Promise<OperationResult> {
        const repo = docs(context);
        const nested = await Promise.all(areasOf(repo, input.area).map(async (area) => (await repo.epics(area)).map((e) => ({ area, id: e.id, slug: e.slug, title: e.title, created_at: e.created_at, updated_at: e.updated_at }))));
        return { kind: 'list', rows: arrange(nested.flat(), input) };
      },
    },
  };
}

/**
 * Builds `opportunity_list`.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function opportunityListOperation(docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'opportunity_list',
    group: 'opportunity',
    action: 'list',
    kind: 'query',
    input: OPPORTUNITY_LIST_INPUT,
    description: 'List the opportunities of documentation epics with their dates.',
    examples: [{ epic: 'warlog' }],
    defaultFormat: 'table',
    load: 'point',
    handler: {
      async handle(input: z.infer<typeof OPPORTUNITY_LIST_INPUT>, context: OperationContext): Promise<OperationResult> {
        const repo = docs(context);
        const nested = await Promise.all(areasOf(repo, input.area).map(async (area) => (await repo.opportunities(area, input.epic)).map((o) => ({ area, id: o.id, epic: o.epic, slug: o.slug, title: o.title, created_at: o.created_at, updated_at: o.updated_at }))));
        return { kind: 'list', rows: arrange(nested.flat(), input) };
      },
    },
  };
}
