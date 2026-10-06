/**
 * Paths of the document registry (plan §3.8), always confined to the area's folder (WL-49):
 *
 * ```
 * <area>/docs/<epic>/epic.md
 *                   /<opportunity>/opportunity.md
 *                                 /<kind>.md
 *                                 /.meta/<kind>.yaml  /.meta/<kind>.toc.yaml
 *                                 /assets/<kind>/<relative path>
 *                                 /versions/<kind>/<n>/{<kind>.md, meta.yaml, toc.yaml, assets/…}
 * ```
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { assertValid, isSlug } from '../../core/security/identifiers.ts';
import type { PathGuard } from '../../core/security/path-guard.ts';
import type { StoreRoots } from '../../core/storage/store-roots.ts';
import type { DocArea, DocLocation } from './doc.schema.ts';

/** Resolves document paths for a call's roots. */
export class DocPaths {
  /** Path guard. */
  private readonly guard: PathGuard;
  /** Roots of the call. */
  private readonly roots: StoreRoots;

  /**
   * Creates the resolver.
   * @param guard - Path guard.
   * @param roots - Roots of the call.
   */
  constructor(guard: PathGuard, roots: StoreRoots) {
    this.guard = guard;
    this.roots = roots;
  }

  /**
   * Folder holding the area's documents.
   * @param area - Area.
   * @returns The absolute path (`<repo-data>/docs` or `<global>/global/docs`).
   * @throws {WarlogError} `NO_REPO_CONTEXT` for the repository area outside a repository.
   */
  async areaRoot(area: DocArea): Promise<string> {
    if (area === 'global') {
      return this.guard.resolveInside(this.roots.global, 'global', 'docs');
    }
    if (this.roots.repository === undefined) {
      throw new WarlogError('NO_REPO_CONTEXT', 'not inside a git repository; repository area unavailable');
    }
    return this.guard.resolveInside(this.roots.repository.root, 'docs');
  }

  /**
   * Folder of an epic.
   * @param area - Area.
   * @param epic - Epic slug.
   * @returns The absolute path.
   * @throws {WarlogError} `VALIDATION` for a bad slug; `NO_REPO_CONTEXT`.
   */
  async epicDir(area: DocArea, epic: string): Promise<string> {
    assertValid(isSlug(epic), 'epic', 'a slug ([a-z0-9-], max 80)');
    return this.guard.resolveInside(await this.areaRoot(area), epic);
  }

  /**
   * Folder of an opportunity.
   * @param area - Area.
   * @param epic - Epic slug.
   * @param opportunity - Opportunity slug.
   * @returns The absolute path.
   * @throws {WarlogError} `VALIDATION` for a bad slug; `NO_REPO_CONTEXT`.
   */
  async oppDir(area: DocArea, epic: string, opportunity: string): Promise<string> {
    assertValid(isSlug(opportunity), 'opportunity', 'a slug ([a-z0-9-], max 80)');
    return this.guard.resolveInside(await this.epicDir(area, epic), opportunity);
  }

  /**
   * Path inside an opportunity folder.
   * @param loc - Document location.
   * @param segments - Segments below the opportunity folder.
   * @returns The absolute path.
   * @throws {WarlogError} `VALIDATION` when a segment is unsafe.
   */
  async inOpp(loc: DocLocation, ...segments: string[]): Promise<string> {
    return this.guard.resolveInside(await this.oppDir(loc.area, loc.epic, loc.opportunity), ...segments);
  }

  /**
   * Stored Markdown file.
   * @param loc - Document location.
   * @returns The absolute path.
   */
  doc(loc: DocLocation): Promise<string> {
    return this.inOpp(loc, `${loc.kind}.md`);
  }

  /**
   * Metadata file.
   * @param loc - Document location.
   * @returns The absolute path.
   */
  meta(loc: DocLocation): Promise<string> {
    return this.inOpp(loc, '.meta', `${loc.kind}.yaml`);
  }

  /**
   * Section index file.
   * @param loc - Document location.
   * @returns The absolute path.
   */
  toc(loc: DocLocation): Promise<string> {
    return this.inOpp(loc, '.meta', `${loc.kind}.toc.yaml`);
  }

  /**
   * Stored asset.
   * @param loc - Document location.
   * @param relative - Asset path relative to the source folder.
   * @returns The absolute path.
   * @throws {WarlogError} `VALIDATION` when a segment of the asset path is unsafe.
   */
  asset(loc: DocLocation, relative: string): Promise<string> {
    return this.inOpp(loc, 'assets', loc.kind, ...relative.split('/'));
  }

  /**
   * Folder of an immutable version.
   * @param loc - Document location.
   * @param version - Version number.
   * @returns The absolute path.
   */
  versionDir(loc: DocLocation, version: number): Promise<string> {
    return this.inOpp(loc, 'versions', loc.kind, String(version));
  }
}
