/**
 * Exports a registered document and its images to a folder (WL-68).
 */
import { basename, join, resolve } from 'node:path';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { isSafeSegment } from '../../core/security/path-guard.ts';
import type { VarRepositoryFactory } from '../var/var.repository.ts';
import type { DocExportInput } from './doc-export.operation.ts';
import { DocReader } from './doc-reader.ts';
import type { DocRepository, DocRepositoryFactory } from './doc.repository.ts';
import { DOCUMENT_META_SCHEMA } from './doc.schema.ts';
import type { FoundDocument } from './doc.schema.ts';
import { ImportPathPolicy } from './import-path-policy.ts';
import { MAX_ASSET_BYTES } from './import/asset-collector.ts';
import { applyReplacements } from './import/link-rewriter.ts';
import { scanMarkdown } from './markdown-scanner.ts';

/** One file to write. */
interface Output {
  /** Destination (inside an allowed root). */
  readonly path: string;
  /** Content. */
  readonly data: string | Uint8Array;
}

/** An image read for export. */
interface ExportAsset {
  /** Path relative to the source folder. */
  readonly path: string;
  /** Content. */
  readonly bytes: Uint8Array;
}

/** Handles `doc_export`. */
export class DocExportHandler implements OperationHandler<DocExportInput> {
  /** File system. */
  private readonly fs: FileSystem;
  /** Document repository factory. */
  private readonly docs: DocRepositoryFactory;
  /** Variable repository factory. */
  private readonly vars: VarRepositoryFactory;

  /**
   * Creates the handler.
   * @param fs - File system.
   * @param docs - Document repository factory.
   * @param vars - Variable repository factory.
   */
  constructor(fs: FileSystem, docs: DocRepositoryFactory, vars: VarRepositoryFactory) {
    this.fs = fs;
    this.docs = docs;
    this.vars = vars;
  }

  /**
   * Reads everything first, checks every destination, then writes: a failure never leaves a
   * half-written export or an empty stand-in for an image.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ id, path, assets }`.
   * @throws {WarlogError} `INVALID_FILE` (`asset_unreadable`) when an image cannot be read; `CONFLICT` when a
   *   destination exists and `overwrite` is not set; `VALIDATION` when a destination is outside the allowed roots.
   */
  async handle(input: DocExportInput, context: OperationContext): Promise<OperationResult> {
    const repo = this.docs(context);
    const reader = new DocReader(this.fs, repo);
    const found = await reader.find(input.id);
    const content = await reader.read(found, context, input.version);
    const assets = await this.assetsOf(repo, found, input.version);
    const policy = await ImportPathPolicy.forCall(this.fs, this.vars, context, found.area);
    const dir = await policy.resolve(resolve(context.cwd, input.path), 'write');
    const prefix = `assets/${found.kind}/`;
    const restore = scanMarkdown(content.text)
      .images.filter((i) => i.dest.startsWith(prefix))
      .map((i) => ({ start: i.destStart, end: i.destEnd, text: i.dest.slice(prefix.length) }));
    const outputs: Output[] = [{ path: join(dir, basename(found.meta.source_path)), data: applyReplacements(content.text, restore) }, ...assets.map((a) => ({ path: join(dir, ...a.path.split('/')), data: a.bytes }))];
    const targets = await Promise.all(outputs.map(async (o) => policy.resolve(o.path, 'write')));
    await this.checkConflicts(targets, input.overwrite);
    for (const [i, output] of outputs.entries()) {
      await this.fs.writeFileAtomic(targets[i] ?? output.path, output.data);
    }
    return { kind: 'object', value: { id: found.meta.id, path: targets[0], assets: assets.length } };
  }

  /**
   * Refuses to replace existing files unless asked to.
   * @param targets - Every destination.
   * @param overwrite - Whether replacing is allowed.
   * @throws {WarlogError} `CONFLICT` listing the files that exist.
   */
  private async checkConflicts(targets: readonly string[], overwrite: boolean): Promise<void> {
    if (overwrite) {
      return;
    }
    const existing = (await Promise.all(targets.map(async (t) => ((await this.fs.stat(t)) === undefined ? undefined : t)))).filter((t): t is string => t !== undefined);
    if (existing.length > 0) {
      throw new WarlogError('CONFLICT', `${existing.length} file(s) exist; pass overwrite=true to replace them`, { reason: 'exists', files: existing.map((f) => basename(f)) });
    }
  }

  /**
   * The images of the exported content, read from the current registration or from a kept version.
   * @param repo - Document repository.
   * @param found - The document.
   * @param version - Kept version asked for, when any.
   * @returns Path (relative to the source folder) and bytes of each image; none for a reference.
   * @throws {WarlogError} `INVALID_FILE` (`asset_unreadable`) when an image is missing or too large.
   */
  private async assetsOf(repo: DocRepository, found: FoundDocument, version: number | undefined): Promise<ExportAsset[]> {
    if (found.meta.mode === 'reference') {
      return [];
    }
    const kept = version !== undefined && version !== found.meta.version;
    const dir = kept ? await repo.paths.versionDir(found, version) : undefined;
    const listed = kept ? await this.keptAssets(repo, `${dir}/meta.yaml`) : found.meta.assets.map((a) => a.path);
    return Promise.all(
      listed.map(async (path) => {
        const from = dir === undefined ? await repo.paths.asset(found, path) : `${dir}/assets/${path}`;
        const bytes = await this.fs.readBinary(from, MAX_ASSET_BYTES).catch(() => undefined);
        if (bytes === undefined || !path.split('/').every(isSafeSegment)) {
          throw new WarlogError('INVALID_FILE', `image ${path} cannot be read, so nothing was exported`, { reason: 'asset_unreadable', file: path });
        }
        return { path, bytes };
      }),
    );
  }

  /**
   * Image paths listed by the metadata of a kept version.
   * @param repo - Document repository.
   * @param metaPath - `meta.yaml` of the version.
   * @returns The paths.
   * @throws {WarlogError} `INVALID_FILE` when the version's metadata is missing or invalid.
   */
  private async keptAssets(repo: DocRepository, metaPath: string): Promise<string[]> {
    const parsed = DOCUMENT_META_SCHEMA.safeParse(await repo.readYaml(metaPath));
    if (!parsed.success) {
      throw new WarlogError('INVALID_FILE', 'metadata of the kept version is invalid', { reason: 'doc_meta', file: metaPath });
    }
    return parsed.data.assets.map((a) => a.path);
  }
}
