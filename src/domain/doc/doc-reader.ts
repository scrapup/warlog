/**
 * Reads the content of a registered document: stored copy, kept version, or the live file of a
 * reference (WL-73), which is compared with its registered fingerprint on every read.
 */
import { join } from 'node:path';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { sha256Hex } from '../../core/security/sha256.ts';
import type { DocRepository } from './doc.repository.ts';
import type { FoundDocument } from './doc.schema.ts';
import { scanMarkdown } from './markdown-scanner.ts';
import { buildToc } from './section-index.ts';
import type { TocEntry } from './section-index.ts';
import { MAX_DOC_BYTES } from './import/document-planner.ts';

/** Content of a document. */
export interface DocContent {
  /** Markdown text. */
  readonly text: string;
  /** Section index. */
  readonly toc: TocEntry[];
  /** `true` when a referenced file changed since registration (its index was refreshed). */
  readonly changed: boolean;
}

/** Reads documents. */
export class DocReader {
  /** File system. */
  private readonly fs: FileSystem;
  /** Document repository. */
  private readonly repo: DocRepository;

  /**
   * Creates the reader.
   * @param fs - File system.
   * @param repo - Document repository.
   */
  constructor(fs: FileSystem, repo: DocRepository) {
    this.fs = fs;
    this.repo = repo;
  }

  /**
   * Finds a document by id.
   * @param id - Document id.
   * @returns The document.
   * @throws {WarlogError} `NOT_FOUND`.
   */
  async find(id: string): Promise<FoundDocument> {
    const found = await this.repo.locate(id);
    if (found === undefined) {
      throw new WarlogError('NOT_FOUND', `document ${id} not found`, { type: 'document', id });
    }
    return found;
  }

  /**
   * Reads the current content, or a kept version.
   * @param found - The document.
   * @param context - Call context.
   * @param version - A kept version number.
   * @returns Text, section index and the changed flag.
   * @throws {WarlogError} `NOT_FOUND` for an unknown version; `INVALID_FILE` for a broken reference.
   */
  async read(found: FoundDocument, context: OperationContext, version?: number): Promise<DocContent> {
    if (found.meta.mode === 'reference') {
      return this.readReference(found, context);
    }
    const { paths } = this.repo;
    if (version !== undefined && version !== found.meta.version) {
      const dir = await paths.versionDir(found, version);
      const text = await this.fs.readFileBounded(`${dir}/${found.kind}.md`, MAX_DOC_BYTES).catch(() => undefined);
      if (text === undefined) {
        throw new WarlogError('NOT_FOUND', `version ${version} of document ${found.meta.id} not found`, { type: 'document_version', id: String(version) });
      }
      return { text, toc: this.asToc(await this.repo.readYaml(`${dir}/toc.yaml`)), changed: false };
    }
    const text = await this.fs.readFileBounded(await paths.doc(found), MAX_DOC_BYTES);
    return { text: text ?? '', toc: await this.repo.readToc(found), changed: false };
  }

  /**
   * Coerces a parsed index file.
   * @param data - Parsed YAML.
   * @returns The entries.
   */
  private asToc(data: unknown): TocEntry[] {
    return Array.isArray(data) ? (data as TocEntry[]) : [];
  }

  /**
   * Reads the live file of a reference and refreshes the registration when it changed.
   * @param found - The document.
   * @param context - Call context.
   * @returns The live content.
   * @throws {WarlogError} `INVALID_FILE` (`broken_reference`) when the file moved or disappeared.
   */
  private async readReference(found: FoundDocument, context: OperationContext): Promise<DocContent> {
    const top = await context.topLevel();
    const path = top === undefined ? undefined : join(top, ...found.meta.source_path.split('/'));
    const text = path === undefined ? undefined : await this.fs.readFileBounded(path, MAX_DOC_BYTES).catch(() => undefined);
    if (text === undefined) {
      throw new WarlogError('INVALID_FILE', `referenced file ${found.meta.source_path} moved or disappeared`, { reason: 'broken_reference', file: found.meta.source_path });
    }
    const sha = sha256Hex(text);
    const toc = buildToc(text, scanMarkdown(text).headings);
    if (sha === found.meta.source_sha256) {
      return { text, toc, changed: false };
    }
    await this.repo.writeYaml(await this.repo.paths.toc(found), toc);
    await this.repo.writeYaml(await this.repo.paths.meta(found), { ...found.meta, source_sha256: sha, bytes: Buffer.byteLength(text), updated_at: context.clock.now().toISOString(), rev: found.meta.rev + 1 });
    return { text, toc, changed: true };
  }
}
