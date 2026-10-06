/**
 * Ranking of `tracker_next` (same order as the current tracker): started work first, then
 * overdue, then tasks of an active epic, priority, having a due date, epic position, task
 * position, creation. Explanations name the criteria that decided.
 */
import type { IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { compareCodeUnits } from '../../core/security/compare.ts';
import { priorityRank, sortOrder, text } from '../shared/rows.ts';

/** A candidate with what ranks it. */
export interface Candidate {
  /** Task. */
  readonly task: IndexedEntity;
  /** Its epic, when any. */
  readonly epic: IndexedEntity | undefined;
}

/**
 * Ranking key of a candidate.
 * @param candidate - Candidate.
 * @param today - Current date (`yyyy-mm-dd`).
 * @returns Numeric criteria, compared in order.
 */
function rankKey(candidate: Candidate, today: string): number[] {
  const { task, epic } = candidate;
  const status = text(task, 'status');
  const due = text(task, 'due_date');
  return [
    status === 'in_progress' ? 0 : status === 'review' ? 1 : 2,
    due !== '' && due < today ? 0 : 1,
    epic !== undefined && text(epic, 'status') === 'in_progress' ? 0 : 1,
    priorityRank(task),
    due === '' ? 1 : 0,
    epic === undefined ? 0 : sortOrder(epic),
    sortOrder(task),
  ];
}

/**
 * Orders candidates best first.
 * @param candidates - Candidates.
 * @param today - Current date.
 * @returns A sorted copy.
 */
export function rankCandidates(candidates: readonly Candidate[], today: string): Candidate[] {
  return [...candidates].sort((a, b) => {
    const ka = rankKey(a, today);
    const kb = rankKey(b, today);
    const diff = ka.findIndex((v, i) => v !== kb[i]);
    return diff >= 0 ? Number(ka[diff]) - Number(kb[diff]) : compareCodeUnits(a.task.id, b.task.id);
  });
}

/**
 * Why a candidate ranks where it does.
 * @param candidate - Candidate.
 * @param today - Current date.
 * @returns A short sentence.
 */
export function explain(candidate: Candidate, today: string): string {
  const { task, epic } = candidate;
  const epicName = epic === undefined ? '(no epic)' : text(epic, 'name');
  const parts = [
    ...STARTED_REASONS.filter(([status]) => text(task, 'status') === status).map(([, reason]) => reason),
    ...dueReason(text(task, 'due_date'), today),
    ...(URGENT.has(text(task, 'priority')) ? [`${text(task, 'priority')} priority`] : []),
    ...(epic !== undefined && text(epic, 'status') === 'in_progress' ? [`in the active epic '${epicName}'`] : []),
  ];
  return parts.length > 0 ? parts.join(', ') : `next in '${epicName}'`;
}

/** Reasons given for work already started. */
const STARTED_REASONS: readonly (readonly [string, string])[] = [
  ['in_progress', 'already in progress'],
  ['review', 'waiting on review'],
];

/** Priorities named in the reason. */
const URGENT = new Set(['critical', 'high']);

/**
 * Reason given by a due date.
 * @param due - Due date (`''` = none).
 * @param today - Current date.
 * @returns Zero or one reason.
 */
function dueReason(due: string, today: string): string[] {
  if (due === '') {
    return [];
  }
  return [due < today ? `overdue since ${due}` : `due ${due}`];
}

/**
 * Candidate of a task.
 * @param view - View.
 * @param task - Task.
 * @returns The candidate.
 */
export function candidateOf(view: StoreView, task: IndexedEntity): Candidate {
  const epic = view.get(text(task, 'epic_id'));
  return { task, epic: epic?.type === 'epic' ? epic : undefined };
}
