/**
 * Reads and writes the document registry (plan §3.8): documentation epics and opportunities as
 * small front-matter files, documents as Markdown with `.meta` beside them. The document registry
 * is outside the entity index (it skips `docs/`), so listings read the folders directly.
 */
import { z } from 'zod';
import { WarlogError, isWarlogError } from '../../core/errors/warlog-error.ts';
import type { Clock } from '../../core/ports/clock.port.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { IdGenerator } from '../../core/ports/id-generator.port.ts';
import type { MachineIdProvider } from '../../core/ports/machine-id.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import { isSlug } from '../../core/security/identifiers.ts';
import type { PathGuard } from '../../core/security/path-guard.ts';
import { parseFrontMatter, stringifyFrontMatter } from '../../core/storage/front-matter-codec.ts';
import type { StoreRoots } from '../../core/storage/store-roots.ts';
import { parseYaml, stringifyYaml } from '../../core/storage/yaml-codec.ts';
import { DOCUMENT_META_SCHEMA, DOC_KINDS, TOC_ENTRY_SCHEMA } from './doc.schema.ts';
import type { Category, DocArea, DocKind, DocLocation, DocumentMeta, FoundDocument } from './doc.schema.ts';
import { DocPaths } from './doc-paths.ts';
import type { TocEntry } from './section-index.ts';

/** Largest metadata or index file read. */
const MAX_META_BYTES = 4 * 1024 * 1024;

/** Collaborators of {@link DocRepository}. */
export interface DocRepositoryDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Path guard. */
  readonly guard: PathGuard;
  /** Roots of the call. */
  readonly roots: StoreRoots;
  /** Clock. */
  readonly clock: Clock;
  /** Machine id. */
  readonly machine: MachineIdProvider;
  /** Identifier generator. */
  readonly ids: IdGenerator;
}

/** An opportunity with the slug of its epic. */
export interface OpportunityCategory extends Category {
  /** Epic slug. */
  readonly epic: string;
}

/** Titles for categories created by a registration. */
export interface CategoryTitles {
  /** Epic title. */
  readonly epic?: string;
  /** Opportunity title. */
  readonly opportunity?: string;
}

/** Whether a registration created each category. */
export interface TouchResult {
  /** The epic was created. */
  readonly epicCreated: boolean;
  /** The opportunity was created. */
  readonly opportunityCreated: boolean;
}

/** Opens the document repository of a call. */
export type DocRepositoryFactory = (request: Pick<DocRepositoryDeps, 'roots' | 'clock' | 'machine' | 'ids'>) => DocRepository;

/**
 * Builds the production factory.
 * @param fs - File system.
 * @param guard - Path guard.
 * @returns The factory.
 */
export function docRepositoryFactory(fs: FileSystem, guard: PathGuard): DocRepositoryFactory {
  return (request) => new DocRepository({ fs, guard, ...request });
}

/**
 * Tells whether a text names a document kind.
 * @param text - Candidate.
 * @returns `true` for a kind.
 */
export function isDocKind(text: string): text is DocKind {
  return (DOC_KINDS as readonly string[]).includes(text);
}

/**
 * Checks a stored section index.
 * @param data - Parsed YAML (`undefined` for a missing file).
 * @param file - File it came from (for the error).
 * @returns The entries (`[]` when there is no index).
 * @throws {WarlogError} `INVALID_FILE` (`doc_toc`) when it is not a list of valid entries.
 */
export function parseToc(data: unknown, file: string): TocEntry[] {
  if (data === undefined) {
    return [];
  }
  const parsed = z.array(TOC_ENTRY_SCHEMA).safeParse(data);
  if (!parsed.success) {
    throw new WarlogError('INVALID_FILE', 'section index is invalid', { reason: 'doc_toc', file });
  }
  return parsed.data;
}

/** The document registry of one call. */
export class DocRepository {
  /** Collaborators. */
  private readonly deps: DocRepositoryDeps;
  /** Path resolver. */
  readonly paths: DocPaths;

  /**
   * Creates the repository.
   * @param deps - Collaborators.
   */
  constructor(deps: DocRepositoryDeps) {
    this.deps = deps;
    this.paths = new DocPaths(deps.guard, deps.roots);
  }

  /**
   * Areas available to this call.
   * @returns `repo` (inside a repository) and `global`.
   */
  areas(): DocArea[] {
    return this.deps.roots.repository === undefined ? ['global'] : ['repo', 'global'];
  }

  /**
   * Reads a YAML file; a missing file is `undefined`.
   * @param path - File path.
   * @returns The parsed value.
   * @throws {WarlogError} `INVALID_FILE` for malformed YAML or an oversized file.
   */
  async readYaml(path: string): Promise<unknown> {
    if ((await this.deps.fs.stat(path)) === undefined) {
      return undefined;
    }
    const text = await this.deps.fs.readFileBounded(path, MAX_META_BYTES);
    if (text === undefined) {
      throw new WarlogError('INVALID_FILE', 'metadata file is too large', { reason: 'too_large', file: path });
    }
    return parseYaml(text, path);
  }

  /**
   * Subfolders of a folder (`[]` when it does not exist).
   * @param dir - Folder.
   * @returns Names of the entries that are slugs and directories.
   */
  private async folders(dir: string): Promise<string[]> {
    const names = await this.deps.fs.readDir(dir);
    const stats = await Promise.all(names.filter((n) => isSlug(n)).map(async (n) => ({ n, stat: await this.deps.fs.stat(`${dir}/${n}`) })));
    return stats.filter((s) => s.stat?.isDirectory === true).map((s) => s.n).sort(compareCodeUnits);
  }

  /**
   * Reads a category file (`epic.md` or `opportunity.md`).
   * @param path - File path.
   * @param slug - Folder name.
   * @returns The category, or `undefined` when the file is missing or malformed.
   */
  private async readCategory(path: string, slug: string): Promise<Category | undefined> {
    try {
      const doc = parseFrontMatter(await this.deps.fs.readFile(path), path);
      const d = doc.data;
      return typeof d['id'] === 'string' ? { id: d['id'], slug, title: String(d['title'] ?? slug), created_at: String(d['created_at'] ?? ''), updated_at: String(d['updated_at'] ?? ''), rev: Number(d['rev'] ?? 1) } : undefined;
    } catch (error: unknown) {
      if (isWarlogError(error, 'NOT_FOUND') || isWarlogError(error, 'INVALID_FILE')) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Documentation epics of an area.
   * @param area - Area.
   * @returns The epics, ordered by slug.
   */
  async epics(area: DocArea): Promise<Category[]> {
    const root = await this.paths.areaRoot(area);
    const found = await Promise.all((await this.folders(root)).map((slug) => this.readCategory(`${root}/${slug}/epic.md`, slug)));
    return found.filter((c): c is Category => c !== undefined);
  }

  /**
   * Opportunities of an area (or of one epic).
   * @param area - Area.
   * @param epic - Epic slug, to list one epic only.
   * @returns The opportunities with their epic slug, ordered by epic then slug.
   */
  async opportunities(area: DocArea, epic?: string): Promise<OpportunityCategory[]> {
    const epics = epic === undefined ? (await this.epics(area)).map((e) => e.slug) : [epic];
    const nested = await Promise.all(
      epics.map(async (e) => {
        const dir = await this.paths.epicDir(area, e);
        const found = await Promise.all((await this.folders(dir)).map((slug) => this.readCategory(`${dir}/${slug}/opportunity.md`, slug)));
        return found.filter((c): c is Category => c !== undefined).map((c) => ({ ...c, epic: e }));
      }),
    );
    return nested.flat();
  }

  /**
   * Documents of an area, optionally narrowed.
   * @param area - Area.
   * @param epic - Epic slug.
   * @param opportunity - Opportunity slug.
   * @param kind - Kind.
   * @returns The documents with their metadata.
   */
  async documents(area: DocArea, epic?: string, opportunity?: string, kind?: DocKind): Promise<FoundDocument[]> {
    const opps = (await this.opportunities(area, epic)).filter((o) => opportunity === undefined || o.slug === opportunity);
    const nested = await Promise.all(
      opps.map(async (o) => {
        const loc = { area, epic: o.epic, opportunity: o.slug };
        const metaDir = await this.paths.inOpp({ ...loc, kind: 'spec' }, '.meta');
        const kinds = (await this.deps.fs.readDir(metaDir)).filter((n) => n.endsWith('.yaml') && !n.endsWith('.toc.yaml')).map((n) => n.slice(0, -'.yaml'.length)).filter(isDocKind);
        const metas = await Promise.all(kinds.filter((k) => kind === undefined || k === kind).map(async (k) => ({ ...loc, kind: k, meta: await this.readMeta({ ...loc, kind: k }) })));
        return metas.filter((m): m is FoundDocument => m.meta !== undefined);
      }),
    );
    return nested.flat();
  }

  /**
   * Finds a document by id across the available areas.
   * @param id - Document id.
   * @returns The document, when found.
   */
  async locate(id: string): Promise<FoundDocument | undefined> {
    for (const area of this.areas()) {
      const found = (await this.documents(area)).find((d) => d.meta.id === id);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  /**
   * Reads a document's metadata.
   * @param loc - Document location.
   * @returns The metadata, or `undefined` when the document does not exist.
   * @throws {WarlogError} `INVALID_FILE` for malformed metadata.
   */
  async readMeta(loc: DocLocation): Promise<DocumentMeta | undefined> {
    const path = await this.paths.meta(loc);
    const data = await this.readYaml(path);
    if (data === undefined) {
      return undefined;
    }
    const parsed = DOCUMENT_META_SCHEMA.safeParse(data);
    if (!parsed.success || parsed.data.kind !== loc.kind) {
      throw new WarlogError('INVALID_FILE', `document metadata of ${loc.kind} is invalid`, { reason: 'doc_meta', file: path });
    }
    const { links, ...rest } = parsed.data;
    return links === undefined ? rest : { ...rest, links };
  }

  /**
   * Reads a document's section index.
   * @param loc - Document location.
   * @returns The entries (`[]` when missing).
   */
  async readToc(loc: DocLocation): Promise<TocEntry[]> {
    const path = await this.paths.toc(loc);
    return parseToc(await this.readYaml(path), path);
  }

  /**
   * Writes a metadata or index file.
   * @param path - File path.
   * @param value - Value to store as YAML.
   * @returns When written.
   */
  async writeYaml(path: string, value: unknown): Promise<void> {
    await this.deps.fs.writeFileAtomic(path, stringifyYaml(value));
  }

  /**
   * Makes sure the epic and opportunity folders carry their category files, creating them (and
   * touching `updated_at` of existing ones).
   * @param area - Area.
   * @param epic - Epic slug.
   * @param opportunity - Opportunity slug.
   * @param titles - Titles for new categories (`epic`, `opportunity`).
   * @returns Whether each category was created.
   */
  async touchCategories(area: DocArea, epic: string, opportunity: string, titles: CategoryTitles = {}): Promise<TouchResult> {
    const epicCreated = await this.touch(`${await this.paths.epicDir(area, epic)}/epic.md`, { type: 'doc_epic', slug: epic, title: titles.epic ?? epic });
    const opportunityCreated = await this.touch(`${await this.paths.oppDir(area, epic, opportunity)}/opportunity.md`, { type: 'opportunity', epic, slug: opportunity, title: titles.opportunity ?? opportunity });
    return { epicCreated, opportunityCreated };
  }

  /**
   * Creates a category file or bumps its `rev` and `updated_at`.
   * @param path - File path.
   * @param fields - Fields of a new category.
   * @returns `true` when it was created.
   */
  private async touch(path: string, fields: Readonly<Record<string, unknown>>): Promise<boolean> {
    const now = this.deps.clock.now().toISOString();
    const machine = await this.deps.machine.get();
    let current: ReturnType<typeof parseFrontMatter> | undefined;
    try {
      current = parseFrontMatter(await this.deps.fs.readFile(path), path);
    } catch (error: unknown) {
      if (!isWarlogError(error, 'NOT_FOUND')) {
        throw error;
      }
    }
    const data =
      current === undefined
        ? { id: this.deps.ids.next(), ...fields, rev: 1, created_at: now, updated_at: now, machine }
        : { ...current.data, rev: Number(current.data['rev'] ?? 1) + 1, updated_at: now, machine };
    await this.deps.fs.writeFileAtomic(path, stringifyFrontMatter({ data, body: current?.body ?? '' }));
    return current === undefined;
  }
}
