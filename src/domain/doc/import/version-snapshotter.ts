/**
 * Keeps the current content of a document, with its images, as an immutable numbered version
 * (WL-64) before a re-registration replaces it.
 */
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
   */
  async snapshot(loc: DocLocation, meta: DocumentMeta): Promise<string> {
    const { paths } = this.repo;
    const dir = await paths.versionDir(loc, meta.version);
    const text = await this.fs.readFileBounded(await paths.doc(loc), MAX_DOC_BYTES);
    await this.fs.writeFileAtomic(`${dir}/${loc.kind}.md`, text ?? '');
    await this.repo.writeYaml(`${dir}/meta.yaml`, meta);
    await this.repo.writeYaml(`${dir}/toc.yaml`, await this.repo.readToc(loc));
    for (const asset of meta.assets) {
      const bytes = await this.fs.readBinary(await paths.asset(loc, asset.path), MAX_ASSET_BYTES);
      if (bytes !== undefined) {
        await this.fs.writeFileAtomic(`${dir}/assets/${asset.path}`, bytes);
      }
    }
    return dir;
  }
}
