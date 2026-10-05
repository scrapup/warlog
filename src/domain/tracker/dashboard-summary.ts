/**
 * The one-paragraph summary of `tracker_dashboard` (same sentences as the current tracker).
 */
import type { Row } from '../shared/rows.ts';

/** What the summary is built from. */
export interface SummaryInput {
  /** Project name. */
  readonly projectName: string;
  /** Branch label, when scoped. */
  readonly branchLabel: string | undefined;
  /** Stats section. */
  readonly stats: Row;
  /** Epic rows. */
  readonly epics: readonly Row[];
  /** Number of overdue tasks. */
  readonly overdue: number;
  /** Hidden counts (archived epics, removed tasks) when not shown. */
  readonly hidden: readonly string[];
  /** Number of other projects when none was specified. */
  readonly others: number;
}

/**
 * Builds the summary.
 * @param input - Sections.
 * @returns The summary text.
 */
export function dashboardSummary(input: SummaryInput): string {
  const { stats } = input;
  const scope = input.branchLabel === undefined ? '' : ` [branch: ${input.branchLabel}]`;
  const parts = [`${input.projectName}${scope}: ${String(stats['total_tasks'])} tasks across ${String(stats['total_epics'])} epics. ${String(stats['completion_pct'])}% complete.`];
  const active = input.epics.filter((e) => e['status'] === 'in_progress');
  if (active.length > 0) {
    parts.push(`Active: ${active.map((e) => `${String(e['name'])} (${String(e['done_count'])}/${String(e['task_count'])} done)`).join(', ')}.`);
  }
  const next = input.epics.find((e) => e['status'] === 'planned');
  if (next !== undefined) {
    parts.push(`Next up: ${String(next['name'])} (${String(next['task_count'])} tasks).`);
  }
  const blocked = Number(stats['tasks_blocked']);
  parts.push(blocked > 0 ? `${blocked} blocked task(s).` : 'No blocked tasks.');
  if (input.overdue > 0) {
    parts.push(`${input.overdue} overdue task(s).`);
  }
  if (Number(stats['tasks_in_progress']) > 0) {
    parts.push(`${String(stats['tasks_in_progress'])} in progress.`);
  }
  if (input.hidden.length > 0) {
    parts.push(`Hidden: ${input.hidden.join(' and ')} — pass include_archived to include them.`);
  }
  if (input.others > 0) {
    parts.push(`Note: this store holds ${input.others + 1} projects and none was specified — showing '${input.projectName}'. Pass project_id, or set WARLOG_PROJECT, to scope to another.`);
  }
  return parts.join(' ');
}
