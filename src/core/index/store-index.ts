/**
 * The in-memory view of the store (plan §3.7, WL-06): rebuilt from the files at start, never
 * persisted. Holds entities, variables, relations and the files excluded from the view.
 */
import { compareCodeUnits } from '../security/compare.ts';
import type { EntityType } from '../storage/entity-ref.ts';
import type { ActivitySummary } from './activity-aggregator.ts';
import { EMPTY_ACTIVITY } from './activity-aggregator.ts';
import { ExcludedFiles } from './excluded-files.ts';
import type { EntityLink, FileProblem, IndexedEntity, IndexedVar, TempFile } from './indexed-entity.ts';
import { isEntityTarget, isExternal, linksOf, parentsOf } from './relations.ts';

/**
 * Adds a value to a set held in a map.
 * @param map - Map of sets.
 * @param key - Key.
 * @param value - Value.
 */
function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

/**
 * Removes a value from a set held in a map (dropping empty sets).
 * @param map - Map of sets.
 * @param key - Key.
 * @param value - Value.
 */
function removeFrom(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key);
  set?.delete(value);
  if (set?.size === 0) {
    map.delete(key);
  }
}

/**
 * Key of the type + project map.
 * @param type - Entity type.
 * @param projectId - Project, if any.
 * @returns Map key.
 */
function typeKey(type: EntityType, projectId: string | undefined): string {
  return `${type}\u0000${projectId ?? ''}`;
}

/** The view: queries plus the mutations used by the builder and the watcher. */
export class StoreIndex {
  /** Entities by id. */
  private readonly entities = new Map<string, IndexedEntity>();
  /** Entity id by file path. */
  private readonly idByPath = new Map<string, string>();
  /** Ids by type and project. */
  private readonly byTypeProject = new Map<string, Set<string>>();
  /** Child ids by parent id. */
  private readonly children = new Map<string, Set<string>>();
  /** Source ids by link target. */
  private readonly backlinks = new Map<string, Set<string>>();
  /** Variables by file path. */
  private readonly vars = new Map<string, IndexedVar>();
  /** Files excluded from the view (WL-43). */
  readonly excluded = new ExcludedFiles();
  /** Activity of the last 90 days. */
  private activitySummary: ActivitySummary = EMPTY_ACTIVITY;

  /**
   * Number of entities in the view.
   * @returns The count.
   */
  get size(): number {
    return this.entities.size;
  }

  /**
   * Returns an entity.
   * @param id - Entity id.
   * @returns The entity, when present.
   */
  get(id: string): IndexedEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Lists entities of a type (and project), ordered by id.
   * @param type - Entity type.
   * @param projectId - Project filter (`undefined` = entities without project).
   * @returns The entities.
   */
  list(type: EntityType, projectId?: string): IndexedEntity[] {
    return this.resolve(this.byTypeProject.get(typeKey(type, projectId)));
  }

  /**
   * Lists the entities whose parent field points to an entity.
   * @param parentId - Parent id.
   * @returns The children, ordered by id.
   */
  childrenOf(parentId: string): IndexedEntity[] {
    return this.resolve(this.children.get(parentId));
  }

  /**
   * Lists the entities linking to a target.
   * @param target - Target id or reference.
   * @returns The source entities, ordered by id.
   */
  backlinksOf(target: string): IndexedEntity[] {
    return this.resolve(this.backlinks.get(target));
  }

  /**
   * Finds the entity carrying an external reference (WL-23).
   * @param system - External system.
   * @param key - External key.
   * @returns The entity, when present.
   */
  byExternal(system: string, key: string): IndexedEntity | undefined {
    return [...this.entities.values()].find((e) => {
      const external = e.record.data['external'];
      return Array.isArray(external) && external.some((x: unknown) => isExternal(x, system, key));
    });
  }

  /**
   * Links and dependencies whose ULID target is not (yet) in the view (WL-44).
   * @returns Pending links, ordered by source.
   */
  pendingLinks(): EntityLink[] {
    return [...this.entities.values()]
      .flatMap((e) => linksOf(e))
      .filter((l) => isEntityTarget(l.target) && !this.entities.has(l.target))
      .sort((a, b) => compareCodeUnits(a.from, b.from) || compareCodeUnits(a.target, b.target));
  }

  /**
   * Lists the variables of a scope (and project).
   * @param filter - Keeps a variable when it returns `true`.
   * @returns The variables, ordered by name.
   */
  listVars(filter: (v: IndexedVar) => boolean): IndexedVar[] {
    return [...this.vars.values()].filter(filter).sort((a, b) => compareCodeUnits(a.name, b.name));
  }

  /**
   * Activity of the last 90 days.
   * @returns The summary.
   */
  get activity(): ActivitySummary {
    return this.activitySummary;
  }

  /**
   * Adds or replaces an entity (its previous file and relations are dropped first).
   * @param entity - Entity.
   */
  upsert(entity: IndexedEntity): void {
    this.removePath(entity.path);
    const previous = this.entities.get(entity.id);
    if (previous !== undefined) {
      this.removePath(previous.path);
    }
    this.entities.set(entity.id, entity);
    this.idByPath.set(entity.path, entity.id);
    addTo(this.byTypeProject, typeKey(entity.type, entity.projectId), entity.id);
    parentsOf(entity).forEach((parent) => addTo(this.children, parent, entity.id));
    linksOf(entity).forEach((link) => addTo(this.backlinks, link.target, entity.id));
  }

  /**
   * Tells whether another file already holds an entity id.
   * @param id - Entity id.
   * @param path - File claiming the id.
   * @returns `true` when the id belongs to a different file.
   */
  isTakenByOther(id: string, path: string): boolean {
    const current = this.entities.get(id);
    return current !== undefined && current.path !== path;
  }

  /**
   * Adds or replaces a variable.
   * @param entry - Variable.
   */
  upsertVar(entry: IndexedVar): void {
    this.removePath(entry.path);
    this.vars.set(entry.path, entry);
  }

  /**
   * Records an excluded file.
   * @param problem - Problem.
   * @param kind - `invalid` or `conflict_copy`.
   */
  exclude(problem: FileProblem, kind: 'invalid' | 'conflict_copy'): void {
    this.removePath(problem.path);
    this.excluded.add(problem, kind);
  }

  /**
   * Records a temporary file.
   * @param file - Temporary file.
   */
  addTemp(file: TempFile): void {
    this.removePath(file.path);
    this.excluded.addTemp(file);
  }

  /**
   * Replaces the activity summary.
   * @param summary - Summary.
   */
  setActivity(summary: ActivitySummary): void {
    this.activitySummary = summary;
  }

  /**
   * Forgets everything known about a file.
   * @param path - Absolute path.
   */
  removePath(path: string): void {
    this.excluded.remove(path);
    this.vars.delete(path);
    const id = this.idByPath.get(path);
    const entity = id === undefined ? undefined : this.entities.get(id);
    this.idByPath.delete(path);
    if (entity === undefined || entity.path !== path) {
      return;
    }
    this.entities.delete(entity.id);
    removeFrom(this.byTypeProject, typeKey(entity.type, entity.projectId), entity.id);
    parentsOf(entity).forEach((parent) => removeFrom(this.children, parent, entity.id));
    linksOf(entity).forEach((link) => removeFrom(this.backlinks, link.target, entity.id));
  }

  /**
   * Forgets a file or a whole directory (a deleted folder may report only its own path).
   * @param path - Absolute path of a file or directory.
   * @param separator - Path separator of the platform.
   */
  removeTree(path: string, separator: string): void {
    const prefix = `${path}${separator}`;
    this.knownPaths().filter((p) => p === path || p.startsWith(prefix)).forEach((p) => this.removePath(p));
  }

  /**
   * Replaces the whole content with another index's (atomic swap after a rescan).
   * @param other - Freshly built index.
   */
  replaceWith(other: StoreIndex): void {
    for (const path of this.knownPaths()) {
      this.removePath(path);
    }
    other.entities.forEach((e) => this.upsert(e));
    other.vars.forEach((v) => this.upsertVar(v));
    this.excluded.addAll(other.excluded);
    this.activitySummary = other.activitySummary;
  }

  /**
   * Every file path the view knows about.
   * @returns Paths.
   */
  private knownPaths(): string[] {
    return [...this.idByPath.keys(), ...this.vars.keys(), ...this.excluded.paths()];
  }

  /**
   * Resolves ids to entities, ordered by id.
   * @param ids - Ids.
   * @returns The entities.
   */
  private resolve(ids: ReadonlySet<string> | undefined): IndexedEntity[] {
    return [...(ids ?? [])]
      .sort(compareCodeUnits)
      .map((id) => this.entities.get(id))
      .filter((e): e is IndexedEntity => e !== undefined);
  }
}
