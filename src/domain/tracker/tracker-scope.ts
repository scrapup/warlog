/**
 * The slice of a project a tracker query looks at: epics matching the branch filter and the
 * archive flag, and their tasks (plus the project's epic-less tasks when no branch is asked).
 */
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { byEpicOrder, isArchived } from '../epic/epic-list.handler.ts';
import { matchesBranch } from '../shared/lookup.ts';
import type { BranchFilter } from '../shared/lookup.ts';
import { text } from '../shared/rows.ts';

/** Epics and tasks in scope. */
export interface TrackerScope {
  /** Epics, in manual order. */
  readonly epics: IndexedEntity[];
  /** Tasks. */
  readonly tasks: IndexedEntity[];
}

/** What selects the scope. */
export interface ScopeFilter {
  /** Project (`undefined` = every project). */
  readonly projectId: string | undefined;
  /** Branch filter. */
  readonly branch: BranchFilter;
  /** Include archived epics and removed tasks. */
  readonly includeHidden: boolean;
}

/**
 * Selects the epics and tasks of a scope.
 * @param view - View.
 * @param filter - Project, branch and visibility.
 * @returns Epics and tasks.
 */
export function trackerScope(view: StoreView, filter: ScopeFilter): TrackerScope {
  /**
   * Tells whether an entity belongs to the project filter.
   * @param e - Entity.
   * @returns `true` when kept.
   */
  const inProject = (e: IndexedEntity): boolean => filter.projectId === undefined || e.projectId === filter.projectId;
  const epics = view
    .ofType('epic')
    .filter((e) => inProject(e) && !e.deleted && matchesBranch(e, filter.branch) && (filter.includeHidden || !isArchived(e)))
    .sort(byEpicOrder);
  const epicIds = new Set(epics.map((e) => e.id));
  const tasks = view.ofType('task').filter((t) => {
    const epicId = text(t, 'epic_id');
    const placed = epicId === '' ? inProject(t) && filter.branch === undefined : epicIds.has(epicId);
    return placed && (filter.includeHidden || !t.deleted);
  });
  return { epics, tasks };
}
