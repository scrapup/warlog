/**
 * Reading documents (WL-66, WL-73): `doc_get` (whole, by section or by page), `doc_toc` and
 * `doc_search` (matching sections). Large documents are never served whole.
 */
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { excerpt, matchCount, tokensOf } from '../shared/text-search.ts';
import { DocReader } from './doc-reader.ts';
import type { DocContent } from './doc-reader.ts';
import type { DocRepositoryFactory } from './doc.repository.ts';
import type { FoundDocument } from './doc.schema.ts';
import { PAGE_BYTES, WHOLE_DOCUMENT_BYTES, splitPages } from './page-splitter.ts';

/** Document id input. */
const DOC_ID = z.string().min(1).describe('Document id (from doc_list)');

/** Version input. */
const VERSION = z.number().int().min(1).optional().describe('A kept version (default: the current content)');

/** `doc_get` input. */
const GET_INPUT = z.object({ id: DOC_ID, section: z.string().min(1).optional().describe('Section anchor from doc_toc'), page: z.number().int().min(1).optional().describe('Page number of a large document'), version: VERSION });

/** `doc_toc` input. */
const TOC_INPUT = z.object({ id: DOC_ID, version: VERSION });

/** `doc_search` input. */
const SEARCH_INPUT = z.object({ id: DOC_ID, query: z.string().min(1).describe('Words to find (case-insensitive, literal; every word must appear in the section)'), version: VERSION });

/** A document and its content. */
interface OpenedDocument {
  /** The document. */
  readonly found: FoundDocument;
  /** Its content. */
  readonly content: DocContent;
}

/**
 * Opens a document and its content.
 * @param fs - File system.
 * @param docs - Repository factory.
 * @param context - Call context.
 * @param id - Document id.
 * @param version - Kept version, when asked.
 * @returns The document, its content and the reader.
 */
async function open(fs: FileSystem, docs: DocRepositoryFactory, context: OperationContext, id: string, version?: number): Promise<OpenedDocument> {
  const reader = new DocReader(fs, docs(context));
  const found = await reader.find(id);
  return { found, content: await reader.read(found, context, version) };
}

/**
 * Common fields of a document answer.
 * @param found - The document.
 * @param content - Its content.
 * @returns The fields.
 */
function head(found: FoundDocument, content: DocContent): Record<string, unknown> {
  return { id: found.meta.id, kind: found.kind, title: found.meta.title, mode: found.meta.mode, version: found.meta.version, bytes: Buffer.byteLength(content.text), ...(content.changed ? { changed_since_registration: true } : {}) };
}

/**
 * Builds `doc_get`.
 * @param fs - File system.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function docGetOperation(fs: FileSystem, docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_get',
    group: 'doc',
    action: 'get',
    kind: 'query',
    input: GET_INPUT,
    description: 'Read a registered document. Documents above 500 KB return the section index and the first page; read the rest by section anchor or page number. A referenced file is read live and reported as changed_since_registration when it differs from registration.',
    examples: [{ id: '01J0000000000000000000000A' }, { id: '01J0000000000000000000000A', section: 'acceptance-criteria' }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'id',
    handler: {
      async handle(input: z.infer<typeof GET_INPUT>, context: OperationContext): Promise<OperationResult> {
        const { found, content } = await open(fs, docs, context, input.id, input.version);
        const bytes = Buffer.from(content.text);
        const base = head(found, content);
        if (input.section !== undefined) {
          const entry = content.toc.find((t) => t.anchor === input.section);
          if (entry === undefined) {
            throw new WarlogError('NOT_FOUND', `section ${input.section} not found`, { type: 'section', id: input.section });
          }
          return { kind: 'object', value: { ...base, section: entry.anchor, content: bytes.subarray(entry.byte_start, entry.byte_end).toString('utf8') } };
        }
        if (bytes.length <= WHOLE_DOCUMENT_BYTES && input.page === undefined) {
          return { kind: 'object', value: { ...base, content: content.text }, raw: content.text };
        }
        const pages = splitPages(bytes, content.toc);
        const page = pages[(input.page ?? 1) - 1];
        if (page === undefined) {
          throw new WarlogError('NOT_FOUND', `page ${String(input.page)} not found (the document has ${pages.length})`, { type: 'page', id: String(input.page) });
        }
        const toc = input.page === undefined ? { toc: content.toc.map((t) => ({ level: t.level, title: t.title, anchor: t.anchor, bytes: t.bytes })) } : {};
        return { kind: 'object', value: { ...base, page: page.number, pages: pages.length, page_bytes: PAGE_BYTES, ...toc, content: bytes.subarray(page.byte_start, page.byte_end).toString('utf8') } };
      },
    },
  };
}

/**
 * Builds `doc_toc`.
 * @param fs - File system.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function docTocOperation(fs: FileSystem, docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_toc',
    group: 'doc',
    action: 'toc',
    kind: 'query',
    input: TOC_INPUT,
    description: 'Section index of a document: heading tree with anchors and sizes, so you can read only the sections you need.',
    examples: [{ id: '01J0000000000000000000000A' }],
    defaultFormat: 'table',
    load: 'point',
    positional: 'id',
    handler: {
      async handle(input: z.infer<typeof TOC_INPUT>, context: OperationContext): Promise<OperationResult> {
        const { content } = await open(fs, docs, context, input.id, input.version);
        return { kind: 'list', rows: content.toc.map((t) => ({ level: t.level, title: t.title, anchor: t.anchor, bytes: t.bytes })) };
      },
    },
  };
}

/**
 * Builds `doc_search`.
 * @param fs - File system.
 * @param docs - Repository factory.
 * @returns The operation.
 */
export function docSearchOperation(fs: FileSystem, docs: DocRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_search',
    group: 'doc',
    action: 'search',
    kind: 'query',
    input: SEARCH_INPUT,
    description: 'Search inside one document: returns the sections containing every word, with an excerpt and the anchor to read.',
    examples: [{ id: '01J0000000000000000000000A', query: 'rollback' }],
    defaultFormat: 'table',
    load: 'point',
    handler: {
      async handle(input: z.infer<typeof SEARCH_INPUT>, context: OperationContext): Promise<OperationResult> {
        const { content } = await open(fs, docs, context, input.id, input.version);
        const tokens = tokensOf(input.query);
        const bytes = Buffer.from(content.text);
        const rows = content.toc
          .map((t) => ({ t, text: bytes.subarray(t.byte_start, t.byte_end).toString('utf8') }))
          .filter((s) => matchCount(tokens, s.text) === tokens.length)
          .map((s) => ({ anchor: s.t.anchor, title: s.t.title, bytes: s.t.bytes, excerpt: excerpt(s.text.slice(s.text.toLowerCase().indexOf(tokens[0] ?? ''))) }));
        return { kind: 'list', rows };
      },
    },
  };
}
