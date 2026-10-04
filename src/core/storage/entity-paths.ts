/**
 * File paths of entities (plan §3.1), always resolved through the {@link PathGuard} (WL-49).
 */
import { WarlogError } from '../errors/warlog-error.ts';
import { assertValid, isSlug, isUlid } from '../security/identifiers.ts';
import type { PathGuard } from '../security/path-guard.ts';
import type { EntityRef, Scope } from './entity-ref.ts';
import type { StoreRoots } from './store-roots.ts';

/**
 * Directory segments of a project-scoped entity under `projects/<projectId>`.
 * @param ref - Entity reference.
 * @returns Segments relative to the project directory.
 */
function projectSegments(ref: EntityRef): string[] {
  switch (ref.type) {
    case 'project':
      assertValid(ref.projectId === ref.id, 'project_id', 'equal to the project id');
      return ['project.md'];
    case 'comment':
      assertValid(ref.taskId !== undefined && isUlid(ref.taskId), 'task_id', 'a ULID');
      return ['comments', String(ref.taskId), `${ref.id}.md`];
    default:
      return [ref.type === 'story' ? 'stories' : `${ref.type}s`, `${ref.id}.md`];
  }
}

/**
 * Segments of entities that live directly under a scope root (no project).
 * @param ref - Entity reference.
 * @returns Segments, or `undefined` when the entity belongs to a project.
 */
function scopeSegments(ref: EntityRef): string[] | undefined {
  if (ref.type === 'memory' || ref.type === 'questionnaire') {
    const dir = ref.type === 'memory' ? 'memories' : 'questionnaires';
    return ref.scope === 'global' ? ['global', dir, `${ref.id}.md`] : [dir, `${ref.id}.md`];
  }
  if (ref.type === 'template' && ref.scope === 'global') {
    return ['templates', `${ref.id}.md`];
  }
  if (ref.type === 'note' && ref.projectId === undefined && ref.scope === 'repo') {
    return ['notes', `${ref.id}.md`];
  }
  return undefined;
}

/** Computes confined entity paths for a session's roots. */
export class EntityPaths {
  /** Session roots. */
  private readonly roots: StoreRoots;
  /** Path guard. */
  private readonly guard: PathGuard;

  /**
   * Creates the path resolver.
   * @param roots - Session roots.
   * @param guard - Path guard.
   */
  constructor(roots: StoreRoots, guard: PathGuard) {
    this.roots = roots;
    this.guard = guard;
  }

  /**
   * Root directory of a scope.
   * @param scope - `global` or `repo`.
   * @returns The root.
   * @throws {WarlogError} `NO_REPO_CONTEXT` for `repo` outside a repository.
   */
  rootOf(scope: Scope): string {
    if (scope === 'global') {
      return this.roots.global;
    }
    if (this.roots.repository === undefined) {
      throw new WarlogError('NO_REPO_CONTEXT', 'not inside a git repository; repository scope unavailable');
    }
    return this.roots.repository.root;
  }

  /**
   * Absolute path of an entity file.
   * @param ref - Entity reference.
   * @returns The confined path.
   * @throws {WarlogError} `VALIDATION` on malformed ids or unsupported scope/type; `NO_REPO_CONTEXT` without repository.
   */
  async pathFor(ref: EntityRef): Promise<string> {
    const isQuestionnaire = ref.type === 'questionnaire';
    assertValid(isQuestionnaire ? isSlug(ref.id) : isUlid(ref.id), 'id', isQuestionnaire ? 'a slug' : 'a ULID');
    const root = this.rootOf(ref.scope);
    return this.guard.resolveInside(root, ...this.segments(ref));
  }

  /**
   * Segments of an entity path below its scope root.
   * @param ref - Entity reference.
   * @returns Segments.
   * @throws {WarlogError} `VALIDATION` when the type does not exist in the scope.
   */
  private segments(ref: EntityRef): string[] {
    const direct = scopeSegments(ref);
    if (direct !== undefined) {
      return direct;
    }
    if (ref.scope !== 'repo' || ref.type === 'template') {
      throw new WarlogError('VALIDATION', `${ref.type} entities do not exist at ${ref.scope} scope`, { type: ref.type, scope: ref.scope });
    }
    assertValid(ref.projectId !== undefined && isUlid(ref.projectId), 'project_id', 'a ULID');
    return ['projects', String(ref.projectId), ...projectSegments(ref)];
  }
}
