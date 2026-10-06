/**
 * Picks the next task.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { StoreView } from '../../core/ports/store-view.port.ts';
import { resolveBranch, resolveProjectScope } from '../shared/lookup.ts';
import { text } from '../shared/rows.ts';
import { idsIn, subtasksOf, taskBrief, unmetIn } from '../task/task-graph.ts';
import { taskRow } from '../task/task-list.handler.ts';
import { candidateOf, explain, rankCandidates } from './next-ranking.ts';
import type { Candidate } from './next-ranking.ts';
import type { TrackerNextInput } from './tracker-next.operation.ts';
import { trackerScope } from './tracker-scope.ts';

/** A blocked task and what it waits on. */
interface BlockedTask {
  /** Task id. */
  readonly id: string;
  /** Title. */
  readonly title: string;
  /** Unfinished dependencies. */
  readonly waiting_on: Record<string, unknown>[];
}

/** How many blocked tasks one unfinished task holds. */
interface BlockerCount {
  /** Title of the unfinished task. */
  readonly title: string;
  /** Blocked tasks waiting on it. */
  readonly blocking: number;
}

/**
 * Result when nothing is actionable.
 * @param remaining - Unfinished tasks in scope.
 * @param blocked - Blocked tasks.
 * @returns The value.
 */
function nothingActionable(remaining: number, blocked: readonly BlockedTask[]): Record<string, unknown> {
  if (remaining === 0) {
    return { summary: 'Nothing left to do — every task is done, removed, or in an archived epic.', task: null };
  }
  const counts = new Map<string, BlockerCount>();
  blocked.flatMap((b) => b.waiting_on).forEach((w) => {
    const id = String(w['id']);
    const seen = counts.get(id) ?? { title: String(w['title'] ?? ''), blocking: 0 };
    counts.set(id, { ...seen, blocking: seen.blocking + 1 });
  });
  const [worst] = [...counts.entries()].sort((a, b) => b[1].blocking - a[1].blocking);
  const release = worst === undefined ? '' : `Unblocking ${worst[0]} '${worst[1].title}' would release ${worst[1].blocking} of them.`;
  return { summary: `Nothing is actionable: all ${blocked.length} remaining task(s) are blocked. ${release}`.trim(), task: null, blocked };
}

/**
 * First subtask that is unfinished and not waiting on a sibling.
 * @param candidate - Picked task.
 * @returns `{ id, title, status }`, when any.
 */
function nextSubtask(candidate: Candidate): Record<string, unknown> | undefined {
  const subtasks = subtasksOf(candidate.task);
  const done = new Set(subtasks.filter((s) => s.status === 'done').map((s) => s.id));
  const next = subtasks.find((s) => s.status !== 'done' && (s.depends_on ?? []).every((d) => done.has(d)));
  return next === undefined ? undefined : { id: next.id, title: next.title, status: next.status };
}

/**
 * The recommendation.
 * @param view - View.
 * @param ordered - Actionable candidates, best first.
 * @param blocked - Blocked tasks.
 * @param today - Current date.
 * @returns The value.
 */
function recommend(view: StoreView, ordered: readonly Candidate[], blocked: readonly BlockedTask[], today: string): Record<string, unknown> {
  const pick = ordered[0] as Candidate;
  const reason = explain(pick, today);
  const step = nextSubtask(pick);
  const overdue = ordered.slice(1).filter((c) => text(c.task, 'due_date') !== '' && text(c.task, 'due_date') < today);
  const open = subtasksOf(pick.task).filter((s) => s.status !== 'done').length;
  const summary =
    `Work on ${pick.task.id} '${text(pick.task, 'title')}' — ${reason}.` +
    (step === undefined ? '' : ` Next step: ${String(step['title'])}.`) +
    (overdue.length > 0 ? ` Also overdue: ${overdue.slice(0, 3).map((c) => `${c.task.id} '${text(c.task, 'title')}'`).join(', ')}.` : '') +
    (blocked.length > 0 ? ` ${blocked.length} other task(s) are blocked.` : '');
  return {
    summary,
    task: taskRow(view, pick.task),
    reason,
    ...(step === undefined ? {} : { next_subtask: step }),
    ...(open > 0 ? { open_subtasks: open } : {}),
    alternatives: ordered.slice(1, 4).map((c) => ({ id: c.task.id, title: text(c.task, 'title'), why_not_first: explain(c, today) })),
    ...(overdue.length > 0 ? { overdue: overdue.map((c) => ({ id: c.task.id, title: text(c.task, 'title'), due_date: text(c.task, 'due_date') })) } : {}),
    ...(blocked.length > 0 ? { blocked } : {}),
  };
}

/** Handles `tracker_next`. */
export class TrackerNextHandler implements OperationHandler<TrackerNextInput> {
  /**
   * Recommends a task.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns The recommendation (task `null` when nothing is actionable).
   * @throws {WarlogError} `NOT_FOUND` / `VALIDATION` for an unknown project scope.
   */
  async handle(input: TrackerNextInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const projectId = resolveProjectScope(context, view, input.project_id);
    const scope = trackerScope(view, { projectId, branch: await resolveBranch(context, input.branch), includeHidden: false });
    const remaining = scope.tasks.filter((t) => text(t, 'status') !== 'done' && (input.assigned_to === undefined || text(t, 'assigned_to') === input.assigned_to));
    const blocked: BlockedTask[] = [];
    const actionable: Candidate[] = [];
    for (const task of remaining) {
      const unmet = unmetIn(view, idsIn(task, 'depends_on'));
      if (unmet.length > 0) {
        blocked.push({ id: task.id, title: text(task, 'title'), waiting_on: unmet.map((d) => taskBrief(view, d)) });
      } else {
        actionable.push(candidateOf(view, task));
      }
    }
    const today = context.clock.now().toISOString().slice(0, 10);
    const value = actionable.length === 0 ? nothingActionable(remaining.length, blocked) : recommend(view, rankCandidates(actionable, today), blocked, today);
    return { kind: 'object', value };
  }
}
