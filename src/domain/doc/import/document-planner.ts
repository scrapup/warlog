/**
 * Plans a registration (WL-57, WL-60..WL-63, WL-65, WL-73): resolves the path, reads and checks
 * every document, collects and checks its images, and returns everything to write. Any problem in
 * any document fails the whole plan with every problem listed, before a byte is written (WL-62).
 */
import { basename, dirname, join } from 'node:path';
import { WarlogError } from '../../../core/errors/warlog-error.ts';
import type { FileSystem } from '../../../core/ports/file-system.port.ts';
import { compareCodeUnits } from '../../../core/security/compare.ts';
import { isSlug } from '../../../core/security/identifiers.ts';
import { isInside } from '../../../core/security/path-guard.ts';
import type { SecretFinding, SecretGuard } from '../../../core/security/secret-guard.ts';
import { sha256Hex } from '../../../core/security/sha256.ts';
import type { DocArea, DocKind, DocLocation, DocMode, DocumentMeta } from '../doc.schema.ts';
import type { DocRepository } from '../doc.repository.ts';
import { scanMarkdown } from '../markdown-scanner.ts';
import { buildToc } from '../section-index.ts';
import type { TocEntry } from '../section-index.ts';
import { AssetCollector, relativePosix } from './asset-collector.ts';
import type { CollectedAsset } from './asset-collector.ts';
import { inferKind, isMarkdownName } from './kind-inferrer.ts';
import { applyReplacements } from './link-rewriter.ts';
import { checkSddStructure } from './sdd-structure-checker.ts';

/** Largest Markdown document. */
export const MAX_DOC_BYTES = 2 * 1024 * 1024;

/** What a registration asks for. */
export interface ImportRequest {
  /** File or opportunity folder (already resolved to a real path). */
  readonly real: string;
  /** Path as the caller gave it (for messages and metadata). */
  readonly given: string;
  /** Area. */
  readonly area: DocArea;
  /** Mode. */
  readonly mode: DocMode;
  /** Epic slug, when given. */
  readonly epic?: string | undefined;
  /** Opportunity slug, when given. */
  readonly opportunity?: string | undefined;
  /** Kind of a single file, when given. */
  readonly kind?: DocKind | undefined;
  /** Top level of the repository working tree (reference paths are relative to it). */
  readonly topLevel?: string | undefined;
}

/** A document ready to be written. */
export interface PlannedDocument {
  /** Where it goes. */
  readonly loc: DocLocation;
  /** The Markdown to store (image destinations rewritten). */
  readonly text: string;
  /** Title. */
  readonly title: string;
  /** Section index. */
  readonly toc: TocEntry[];
  /** Assets to store (copy mode). */
  readonly assets: CollectedAsset[];
  /** Warnings. */
  readonly warnings: string[];
  /** Source file as recorded in the metadata. */
  readonly sourcePath: string;
  /** SHA-256 of the source content. */
  readonly sourceSha256: string;
  /** Size of the source in bytes. */
  readonly bytes: number;
  /** Metadata of the document being replaced, when any. */
  readonly existing: DocumentMeta | undefined;
}

/** A planned registration. */
export interface ImportPlan {
  /** Area. */
  readonly area: DocArea;
  /** Epic slug. */
  readonly epic: string;
  /** Opportunity slug. */
  readonly opportunity: string;
  /** Mode. */
  readonly mode: DocMode;
  /** Documents to write. */
  readonly documents: PlannedDocument[];
}

/** Epic and opportunity slugs of a registration. */
interface Slugs {
  /** Epic slug. */
  readonly epic: string;
  /** Opportunity slug. */
  readonly opportunity: string;
}

/** One source file to register. */
interface Source {
  /** Real path. */
  readonly path: string;
  /** File name. */
  readonly name: string;
  /** Kind. */
  readonly kind: DocKind;
}

/**
 * Path of a copied source file as recorded in the metadata: relative to the repository when the
 * file is inside it, else just its name. An absolute path would put the user's home folder into
 * a file that is versioned and published.
 * @param request - The request.
 * @param source - The file.
 * @returns The path recorded in the metadata.
 */
function givenPath(request: ImportRequest, source: Source): string {
  const top = request.topLevel;
  return top !== undefined && isInside(top, source.path) ? relativePosix(top, source.path) : source.name;
}

/**
 * Warnings of a document.
 * @param htmlImages - Inline `<img>` tags found.
 * @param headings - Headings found.
 * @returns The warning codes with their detail.
 */
function warningsOf(htmlImages: number, headings: number): string[] {
  return [...(htmlImages > 0 ? [`html_image_not_checked: ${htmlImages} inline <img> tag(s) are neither validated nor copied`] : []), ...(headings === 0 ? ['no_headings: the document has no section index'] : [])];
}

/** Plans registrations. */
export class DocumentPlanner {
  /** File system. */
  private readonly fs: FileSystem;
  /** Document repository. */
  private readonly repo: DocRepository;
  /** Secret guard. */
  private readonly guard: SecretGuard;
  /** Asset collector. */
  private readonly assets: AssetCollector;

  /**
   * Creates the planner.
   * @param fs - File system.
   * @param repo - Document repository.
   * @param guard - Secret guard.
   */
  constructor(fs: FileSystem, repo: DocRepository, guard: SecretGuard) {
    this.fs = fs;
    this.repo = repo;
    this.guard = guard;
    this.assets = new AssetCollector(fs);
  }

  /**
   * Secret patterns in a file's text, as problems that name the file (never the secret), so one
   * secret does not hide the other problems of the registration.
   * @param file - File shown in the problem.
   * @param text - Its text.
   * @returns One problem when a secret is found.
   */
  private secretIssues(file: string, text: string): Issue[] {
    const findings = this.guard.scan(text).map((f) => ({ kind: f.kind, path: file }));
    return findings.length === 0 ? [] : [{ path: file, message: `matches a known secret pattern (${[...new Set(findings.map((f) => f.kind))].join(', ')}); remove it and register again`, findings }];
  }

  /**
   * Plans the registration.
   * @param request - What to register.
   * @returns The plan.
   * @throws {WarlogError} `VALIDATION` listing every problem; `SECRET_REJECTED`; `NOT_FOUND`; `NO_REPO_CONTEXT`.
   */
  async plan(request: ImportRequest): Promise<ImportPlan> {
    const isDir = (await this.fs.stat(request.real))?.isDirectory === true;
    const root = isDir ? request.real : dirname(request.real);
    const { epic, opportunity } = this.categories(request, isDir);
    const problems: Issue[] = [];
    const sources = isDir ? await this.folderSources(request, problems) : [{ path: request.real, name: basename(request.real), kind: request.kind ?? inferKind(basename(request.real)) }];
    this.checkKinds(sources, problems);
    const loc = { area: request.area, epic, opportunity };
    const existing = await this.repo.documents(request.area, epic, opportunity);
    const documents: PlannedDocument[] = [];
    for (const source of sources) {
      const planned = await this.document(request, { ...loc, kind: source.kind }, source, root, existing.find((d) => d.kind === source.kind)?.meta, problems);
      if (planned !== undefined) {
        documents.push(planned);
      }
    }
    this.checkBacklogs([...existing.map((d) => d.kind), ...sources.map((s) => s.kind)], problems);
    if (problems.length > 0) {
      const secrets = problems.filter((p) => p.findings !== undefined);
      if (secrets.length === problems.length) {
        throw new WarlogError('SECRET_REJECTED', 'a document matches a known secret pattern; nothing was registered', { findings: secrets.flatMap((p) => p.findings ?? []) });
      }
      throw new WarlogError('VALIDATION', `${problems.length} problem(s) found; nothing was registered`, { issues: problems });
    }
    return { area: request.area, epic, opportunity, mode: request.mode, documents };
  }

  /**
   * Epic and opportunity slugs: the parameters, else the folder names.
   * @param request - Request.
   * @param isDir - Whether the path is a folder.
   * @returns The slugs.
   * @throws {WarlogError} `VALIDATION` when a slug cannot be determined.
   */
  private categories(request: ImportRequest, isDir: boolean): Slugs {
    const folder = isDir ? request.real : dirname(request.real);
    const opportunity = request.opportunity ?? basename(folder).toLowerCase();
    const epic = request.epic ?? basename(dirname(folder)).toLowerCase();
    const bad = [
      ...(isSlug(epic) ? [] : [{ path: 'epic', message: `"${epic}" is not a slug; pass epic ([a-z0-9-], max 80)` }]),
      ...(isSlug(opportunity) ? [] : [{ path: 'opportunity', message: `"${opportunity}" is not a slug; pass opportunity ([a-z0-9-], max 80)` }]),
    ];
    if (bad.length > 0) {
      throw new WarlogError('VALIDATION', 'epic and opportunity could not be taken from the folder names', { issues: bad });
    }
    return { epic, opportunity };
  }

  /**
   * Markdown files of an opportunity folder.
   * @param request - Request.
   * @param problems - Problems (updated).
   * @returns The sources.
   */
  private async folderSources(request: ImportRequest, problems: Issue[]): Promise<Source[]> {
    const names = (await this.fs.readDir(request.real)).filter(isMarkdownName).sort(compareCodeUnits);
    const sources: Source[] = [];
    for (const name of names) {
      const path = join(request.real, name);
      if ((await this.fs.stat(path))?.isFile === true) {
        sources.push({ path, name, kind: inferKind(name) });
      }
    }
    if (sources.length === 0) {
      problems.push({ path: request.given, message: 'no Markdown (.md) files found in the folder' });
    }
    return sources;
  }

  /**
   * An opportunity holds at most one document of each kind (WL-58).
   * @param sources - Sources.
   * @param problems - Problems (updated).
   */
  private checkKinds(sources: readonly Source[], problems: Issue[]): void {
    for (const kind of new Set(sources.map((s) => s.kind))) {
      const same = sources.filter((s) => s.kind === kind);
      if (same.length > 1) {
        problems.push({ path: same.map((s) => s.name).join(', '), message: `an opportunity holds at most one ${kind} document` });
      }
    }
  }

  /**
   * An opportunity holds `tasks` or `single-tasks`, never both (WL-58).
   * @param kinds - Kinds present after the registration.
   * @param problems - Problems (updated).
   */
  private checkBacklogs(kinds: readonly DocKind[], problems: Issue[]): void {
    if (kinds.includes('tasks') && kinds.includes('single-tasks')) {
      problems.push({ path: 'kind', message: 'an opportunity holds either tasks or single-tasks, never both' });
    }
  }

  /**
   * Reads and checks one document.
   * @param request - Request.
   * @param loc - Where it goes.
   * @param source - The file.
   * @param root - Real path of the source folder tree.
   * @param existing - Metadata of the document being replaced.
   * @param problems - Problems (updated).
   * @returns The planned document, or `undefined` when it has problems.
   */
  private async document(request: ImportRequest, loc: DocLocation, source: Source, root: string, existing: DocumentMeta | undefined, problems: Issue[]): Promise<PlannedDocument | undefined> {
    const before = problems.length;
    const text = await this.fs.readFileBounded(source.path, MAX_DOC_BYTES);
    if (text === undefined) {
      problems.push({ path: source.name, message: 'larger than 2 MB' });
      return undefined;
    }
    problems.push(...this.secretIssues(source.name, text));
    const scan = scanMarkdown(text);
    problems.push(...checkSddStructure(source.kind, scan.headings).map((message) => ({ path: source.name, message })));
    problems.push(...scan.unscannedLines.map((line) => ({ path: source.name, message: `line ${line}: too many image-like constructs to check its image links; split the line` })));
    const collected = await this.assets.collect({ kind: source.kind, root: await this.fs.realpath(root), docDir: dirname(source.path) }, scan.images);
    problems.push(...collected.problems.map((message) => ({ path: source.name, message })));
    problems.push(...collected.assets.filter((a) => a.path.endsWith('.puml') || a.path.endsWith('.svg')).flatMap((a) => this.secretIssues(`${source.name} → ${a.path}`, new TextDecoder().decode(a.bytes))));
    if (problems.length > before) {
      return undefined;
    }
    const copy = request.mode === 'copy';
    const stored = copy ? applyReplacements(text, collected.replacements) : text;
    const toc = copy ? buildToc(stored, scanMarkdown(stored).headings) : buildToc(text, scan.headings);
    return {
      loc,
      text: stored,
      title: scan.headings.find((h) => h.level === 1)?.title ?? basename(source.name, '.md'),
      toc,
      assets: copy ? collected.assets : [],
      warnings: warningsOf(scan.htmlImages, scan.headings.length),
      sourcePath: copy ? givenPath(request, source) : relativePosix(request.topLevel ?? root, source.path),
      sourceSha256: sha256Hex(text),
      bytes: Buffer.byteLength(text),
      existing,
    };
  }
}

/** A problem with a path or field. */
export interface Issue {
  /** Where. */
  readonly path: string;
  /** What is wrong. */
  readonly message: string;
  /** Secret findings (kinds and file, never the value) when the problem is a secret. */
  readonly findings?: SecretFinding[];
}
