/**
 * Writes a validated plan (WL-60, WL-63, WL-64): assets, then the Markdown, then the section
 * index, and the metadata last, so a half-written registration is never listed.
 */
import type { OperationContext } from '../../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../../core/ports/file-system.port.ts';
import type { DocRepository } from '../doc.repository.ts';
import type { DocMode, DocumentMeta } from '../doc.schema.ts';
import type { ImportPlan, PlannedDocument } from './document-planner.ts';
import { VersionSnapshotter } from './version-snapshotter.ts';

/** Summary of one registered document. */
export interface DocumentSummary {
  /** Identifier. */
  readonly id: string;
  /** Kind. */
  readonly kind: string;
  /** Version now current. */
  readonly version: number;
  /** Number of sections. */
  readonly sections: number;
  /** Number of stored assets. */
  readonly assets: number;
  /** Warnings. */
  readonly warnings: string[];
}

/**
 * Fields a re-registration keeps from the replaced document.
 * @param previous - Metadata being replaced.
 * @returns Its links, when it has any.
 */
function carried(previous: DocumentMeta | undefined): Pick<DocumentMeta, 'links'> | Record<string, never> {
  return previous?.links === undefined ? {} : { links: previous.links };
}

/** Writes plans. */
export class DocumentWriter {
  /** File system. */
  private readonly fs: FileSystem;
  /** Document repository. */
  private readonly repo: DocRepository;

  /**
   * Creates the writer.
   * @param fs - File system.
   * @param repo - Document repository.
   */
  constructor(fs: FileSystem, repo: DocRepository) {
    this.fs = fs;
    this.repo = repo;
  }

  /**
   * Writes every document of the plan.
   * @param plan - Validated plan.
   * @param context - Call context.
   * @param keepVersion - Keep the replaced content as a numbered version.
   * @returns One summary per document.
   */
  async apply(plan: ImportPlan, context: OperationContext, keepVersion: boolean): Promise<DocumentSummary[]> {
    await this.repo.touchCategories(plan.area, plan.epic, plan.opportunity);
    const out: DocumentSummary[] = [];
    for (const doc of plan.documents) {
      out.push(await this.write(doc, plan, context, keepVersion));
    }
    return out;
  }

  /**
   * Writes one document.
   * @param doc - Planned document.
   * @param plan - The plan.
   * @param context - Call context.
   * @param keepVersion - Keep the replaced content as a version.
   * @returns Its summary.
   */
  private async write(doc: PlannedDocument, plan: ImportPlan, context: OperationContext, keepVersion: boolean): Promise<DocumentSummary> {
    const { paths } = this.repo;
    if (keepVersion && doc.existing !== undefined) {
      await new VersionSnapshotter(this.fs, this.repo).snapshot(doc.loc, doc.existing);
    }
    await this.storeContent(doc, plan.mode);
    await this.repo.writeYaml(await paths.toc(doc.loc), doc.toc);
    const meta = await this.metaOf(doc, plan, context, keepVersion);
    await this.repo.writeYaml(await paths.meta(doc.loc), meta);
    return { id: meta.id, kind: meta.kind, version: meta.version, sections: doc.toc.length, assets: doc.assets.length, warnings: doc.warnings };
  }

  /**
   * Replaces the stored assets and Markdown of a document.
   * @param doc - Planned document.
   * @param mode - Registration mode.
   * @returns When written.
   */
  private async storeContent(doc: PlannedDocument, mode: DocMode): Promise<void> {
    const { paths } = this.repo;
    if (doc.existing !== undefined) {
      await this.fs.remove(await paths.inOpp(doc.loc, 'assets', doc.loc.kind));
    }
    for (const asset of doc.assets) {
      await this.fs.writeFileAtomic(await paths.asset(doc.loc, asset.path), asset.bytes);
    }
    const target = await paths.doc(doc.loc);
    await (mode === 'copy' ? this.fs.writeFileAtomic(target, doc.text) : this.fs.remove(target));
  }

  /**
   * Metadata of the registration.
   * @param doc - Planned document.
   * @param plan - The plan.
   * @param context - Call context.
   * @param keepVersion - Whether the replaced content was kept as a version.
   * @returns The metadata.
   */
  private async metaOf(doc: PlannedDocument, plan: ImportPlan, context: OperationContext, keepVersion: boolean): Promise<DocumentMeta> {
    const previous = doc.existing;
    const now = context.clock.now().toISOString();
    return {
      id: previous?.id ?? context.ids.next(),
      kind: doc.loc.kind,
      title: doc.title,
      mode: plan.mode,
      source_path: doc.sourcePath,
      source_sha256: doc.sourceSha256,
      bytes: doc.bytes,
      created_at: previous?.created_at ?? now,
      updated_at: now,
      version: previous === undefined ? 1 : previous.version + (keepVersion ? 1 : 0),
      rev: (previous?.rev ?? 0) + 1,
      machine: await context.machine.get(),
      ...carried(previous),
      assets: doc.assets.map((a) => ({ path: a.path, sha256: a.sha256, bytes: a.bytes.byteLength })),
      warnings: doc.warnings,
    };
  }
}
