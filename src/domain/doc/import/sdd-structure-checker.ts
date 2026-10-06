/**
 * Structure checks of SDD documents (WL-62): `spec` and `plan` carry the numbered sections
 * `## 1.` … `## 6.` (English or Portuguese titles); `tasks` and `single-tasks` carry `## US-n`
 * headings and `#### TF-n-m` headings whose number matches their user story, and `single-tasks`
 * has at most five tasks. Other kinds get no structure check. Linear scans, no regular expressions.
 */
import type { Heading } from '../markdown-scanner.ts';
import type { DocKind } from '../doc.schema.ts';

/** Most tasks a `single-tasks` document may hold. */
export const MAX_SINGLE_TASKS = 5;

/** A run of digits and where it ends. */
interface Digits {
  /** The digits. */
  readonly value: string;
  /** Index after the last digit. */
  readonly next: number;
}

/**
 * Leading decimal number of a text.
 * @param text - Text.
 * @param from - Index to start at.
 * @returns The digits and the index after them, or `undefined` without digits.
 */
function digitsAt(text: string, from: number): Digits | undefined {
  let i = from;
  while (i < text.length && text.charAt(i) >= '0' && text.charAt(i) <= '9') {
    i += 1;
  }
  return i > from ? { value: text.slice(from, i), next: i } : undefined;
}

/**
 * User story number of a `US-<n>` heading title.
 * @param title - Heading text.
 * @returns The number as text, or `undefined`.
 */
function usNumber(title: string): string | undefined {
  return title.startsWith('US-') ? digitsAt(title, 3)?.value : undefined;
}

/**
 * Story and task numbers of a `TF-<us>-<n>` heading title.
 * @param title - Heading text.
 * @returns `[us, n]`, or `undefined`.
 */
function tfNumbers(title: string): [string, string] | undefined {
  const us = title.startsWith('TF-') ? digitsAt(title, 3) : undefined;
  const n = us !== undefined && title.charAt(us.next) === '-' ? digitsAt(title, us.next + 1) : undefined;
  return us === undefined || n === undefined ? undefined : [us.value, n.value];
}

/**
 * Problems of the numbered sections of a spec or plan.
 * @param headings - Headings.
 * @returns One message per missing section.
 */
function numberedSections(headings: readonly Heading[]): string[] {
  const level2 = headings.filter((h) => h.level === 2).map((h) => h.title);
  return [1, 2, 3, 4, 5, 6].filter((n) => !level2.some((t) => t.startsWith(`${n}.`))).map((n) => `missing section "## ${n}." (expected sections 1 to 6)`);
}

/**
 * Problems of the user stories and tasks of a backlog.
 * @param headings - Headings.
 * @param kind - `tasks` or `single-tasks`.
 * @returns Messages.
 */
function backlog(headings: readonly Heading[], kind: DocKind): string[] {
  const { tasks, problems } = walkBacklog(headings);
  return [
    ...problems,
    ...(headings.some((h) => h.level === 2 && usNumber(h.title) !== undefined) ? [] : ['no "## US-<n>" heading found']),
    ...(tasks === 0 ? ['no "#### TF-<n>-<m>" heading found'] : []),
    ...(kind === 'single-tasks' && tasks > MAX_SINGLE_TASKS ? [`single-tasks holds ${tasks} tasks; the limit is ${MAX_SINGLE_TASKS}`] : []),
  ];
}

/** Tasks counted and the problems found while walking a backlog. */
interface BacklogWalk {
  /** Number of task headings. */
  readonly tasks: number;
  /** Problems found. */
  readonly problems: string[];
}

/**
 * Walks the headings of a backlog: counts tasks and checks each belongs to the story above it.
 * @param headings - Headings.
 * @returns Task count and misplaced-task problems.
 */
function walkBacklog(headings: readonly Heading[]): BacklogWalk {
  const problems: string[] = [];
  let story: string | undefined;
  let tasks = 0;
  for (const h of headings) {
    story = h.level === 2 ? (usNumber(h.title) ?? story) : story;
    const tf = h.level === 4 ? tfNumbers(h.title) : undefined;
    tasks += tf === undefined ? 0 : 1;
    if (tf !== undefined && tf[0] !== story) {
      problems.push(`task ${h.title.split(':')[0] ?? h.title} does not belong to ${story === undefined ? 'a "## US-n" heading' : `US-${story}`}`);
    }
  }
  return { tasks, problems };
}

/**
 * Checks the structure of a document of an SDD kind.
 * @param kind - Document kind.
 * @param headings - Headings of the document.
 * @returns Problems found (empty when fine or when the kind has no structure check).
 */
export function checkSddStructure(kind: DocKind, headings: readonly Heading[]): string[] {
  if (kind === 'spec' || kind === 'plan') {
    return numberedSections(headings);
  }
  return kind === 'tasks' || kind === 'single-tasks' ? backlog(headings, kind) : [];
}
