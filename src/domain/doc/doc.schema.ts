/**
 * The document registry model (plan §3.8, WL-57..WL-59): kinds, areas, slugs and the stored
 * shapes of documentation epics, opportunities and documents.
 */
import { z } from 'zod';
import { isSlug } from '../../core/security/identifiers.ts';

/** Document kinds (WL-57). */
export const DOC_KINDS = ['spec', 'plan', 'tasks', 'single-tasks', 'design', 'adr', 'other'] as const;
/** Areas a document can live in (WL-59). */
export const DOC_AREAS = ['repo', 'global'] as const;
/** Registration modes (WL-73). */
export const DOC_MODES = ['copy', 'reference'] as const;
/** Sort keys of listings (WL-67). */
export const DOC_SORTS = ['created_at', 'updated_at'] as const;

/** A document kind. */
export type DocKind = (typeof DOC_KINDS)[number];
/** An area. */
export type DocArea = (typeof DOC_AREAS)[number];
/** A registration mode. */
export type DocMode = (typeof DOC_MODES)[number];

/** Kinds that carry the SDD structure checks. */
export const SDD_KINDS: readonly DocKind[] = ['spec', 'plan', 'tasks', 'single-tasks'];

/** A slug (epic or opportunity folder name). */
export const DOC_SLUG = z.string().refine(isSlug, 'must be lower-case letters, digits and "-" (max 80)');

/** Area input. */
export const AREA_FIELD = z.enum(DOC_AREAS).describe('repo (this repository) or global (every repository)');

/** Kind input. */
export const KIND_FIELD = z.enum(DOC_KINDS).describe('spec, plan, tasks, single-tasks, design, adr or other');

/** Sort-key input. */
export const SORT_FIELD = z.enum(DOC_SORTS).default('updated_at').describe('Sort by inclusion date (created_at) or last change (updated_at)');

/** Sort-order input. */
export const ORDER_FIELD = z.enum(['asc', 'desc']).default('desc').describe('Sort order');

/** A stored asset (image or diagram source). */
export interface AssetInfo {
  /** Path relative to the source folder, `/`-separated. */
  readonly path: string;
  /** SHA-256 of its bytes. */
  readonly sha256: string;
  /** Size in bytes. */
  readonly bytes: number;
}

/** Documentation epic or opportunity (a category, WL-59). */
export interface Category {
  /** Identifier (ULID). */
  readonly id: string;
  /** Folder name. */
  readonly slug: string;
  /** Title. */
  readonly title: string;
  /** Inclusion date. */
  readonly created_at: string;
  /** Last change. */
  readonly updated_at: string;
  /** Revision. */
  readonly rev: number;
}

/** A typed link from a document to another entity. */
export interface DocLink {
  /** Relation. */
  readonly rel: string;
  /** Target (`type:id`). */
  readonly target: string;
}

/** Document metadata (`.meta/<kind>.yaml`). */
export interface DocumentMeta {
  /** Identifier (ULID). */
  readonly id: string;
  /** Kind. */
  readonly kind: DocKind;
  /** Title (first level-1 heading, or the file name). */
  readonly title: string;
  /** `copy` or `reference`. */
  readonly mode: DocMode;
  /** Source file: absolute for copy documents from outside a repository, repository-relative for references. */
  readonly source_path: string;
  /** SHA-256 of the source content at registration. */
  readonly source_sha256: string;
  /** Size of the document in bytes. */
  readonly bytes: number;
  /** Inclusion date. */
  readonly created_at: string;
  /** Last change. */
  readonly updated_at: string;
  /** Current version number. */
  readonly version: number;
  /** Revision. */
  readonly rev: number;
  /** Machine of the last writer. */
  readonly machine: string;
  /** Links to other entities (plan §3.2). */
  readonly links?: readonly DocLink[];
  /** Stored assets (copy mode). */
  readonly assets: readonly AssetInfo[];
  /** Warnings found at registration. */
  readonly warnings: readonly string[];
}

/** Where a document lives. */
export interface DocLocation {
  /** Area. */
  readonly area: DocArea;
  /** Epic slug. */
  readonly epic: string;
  /** Opportunity slug. */
  readonly opportunity: string;
  /** Kind. */
  readonly kind: DocKind;
}

/** A document found by a listing. */
export interface FoundDocument extends DocLocation {
  /** Its metadata. */
  readonly meta: DocumentMeta;
}
