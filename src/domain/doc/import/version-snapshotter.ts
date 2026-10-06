/**
 * Keeps the current content of a document, with its images, as an immutable numbered version
 * (WL-64) before a re-registration replaces it.
 */
import { WarlogError } from '../../../core/errors/warlog-error.ts';
import type { FileSystem } from '../../../core/ports/file-system.port.ts';
import type { DocLocation, DocumentMeta } from '../doc.schema.ts';
import type { DocRepository } from '../doc.repository.ts';
import { MAX_ASSET_BYTES } from './asset-collector.ts';
import { MAX_DOC_BYTES } from './document-planner.ts';

/** Snapshots documents. */
export class VersionSnapshotter {
  /** File system. */
  private readonly fs: FileSystem;
  /** Document repository. */
  private readonly repo: DocRepository;

  /**
   * Creates the snapshotter.
   * @param fs - File system.
   * @param repo - Document repository.
   */
  constructor(fs: FileSystem, repo: DocRepository) {
    this.fs = fs;
    this.repo = repo;
  }

  /**
   * Copies the stored document, metadata, section index and assets into `versions/<kind>/<n>/`.
   * @param loc - Document location.
   * @param meta - Metadata of the current content.
   * @returns The folder written.
   * @throws {WarlogError} `INVALID_FILE` (`snapshot_source_unreadable`) when the current content or an
   *   asset cannot be read: a version is never written incomplete, and nothing is replaced after it.
   */
  async snapshot(loc: DocLocation, meta: DocumentMeta): Promise<string> {
    const { paths } = this.repo;
    const dir = await paths.versionDir(loc, meta.version);
    const text = await this.fs.readFileBounded(await paths.doc(loc), MAX_DOC_BYTES).catch(() => undefined);
    if (text === undefined) {
      throw new WarlogError('INVALID_FILE', `the current ${loc.kind} document cannot be read, so no version was kept`, { reason: 'snapshot_source_unreadable', file: `${loc.kind}.md` });
    }
    const assets = await Promise.all(meta.assets.map(async (asset) => ({ asset, bytes: await this.fs.readBinary(await paths.asset(loc, asset.path), MAX_ASSET_BYTES).catch(() => undefined) })));
    const missing = assets.find((a) => a.bytes === undefined);
    if (missing !== undefined) {
      throw new WarlogError('INVALID_FILE', `asset ${missing.asset.path} cannot be read, so no version was kept`, { reason: 'snapshot_source_unreadable', file: missing.asset.path });
    }
    await this.fs.writeFileAtomic(`${dir}/${loc.kind}.md`, text);
    await this.repo.writeYaml(`${dir}/meta.yaml`, meta);
    await this.repo.writeYaml(`${dir}/toc.yaml`, await this.repo.readToc(loc));
    for (const { asset, bytes } of assets) {
      await this.fs.writeFileAtomic(`${dir}/assets/${asset.path}`, bytes ?? new Uint8Array());
    }
    return dir;
  }
}
