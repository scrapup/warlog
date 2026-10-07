/**
 * Checks of an import plan that the export schema cannot express (WL-14): exporter ids must be
 * unique per type and the dependencies must not form a cycle, as `task_create`/`task_update`
 * already guarantee. Both run before anything is written.
 */
import type { ImportPlan } from './import-plan.ts';
import type { SagaExport } from './saga-export.schema.ts';

/** A problem found in an export. */
export interface ImportIssue {
  /** Path of the offending record, relative to the export. */
  readonly path: string;
  /** What is wrong. */
  readonly message: string;
}

/** A record that may carry an exporter id. */
interface WithOriginalId {
  /** Exporter id. */
  readonly _original_id?: string | number | null | undefined;
}

/** A step of the dependency walk. */
interface Frame {
  /** Task id. */
  readonly node: string;
  /** Index of the next dependency to explore. */
  next: number;
}

/**
 * Reports exporter ids used by more than one record of a list.
 * @param records - Records of one type, with their optional exporter id.
 * @param path - Path of the list.
 * @returns One issue per repeated id.
 */
function repeatedIds(records: readonly WithOriginalId[], path: string): ImportIssue[] {
  const seen = new Set<string>();
  const issues: ImportIssue[] = [];
  records.forEach((record, index) => {
    const original = record._original_id;
    if (original === undefined || original === null) {
      return;
    }
    const key = String(original);
    if (seen.has(key)) {
      issues.push({ path: `${path}.${index}._original_id`, message: `duplicate exporter id ${key}` });
    }
    seen.add(key);
  });
  return issues;
}

/**
 * Reports duplicate exporter ids among epics, stories and tasks (a repeated id would silently
 * redirect dependencies and relations to the last record).
 * @param data - Validated export.
 * @returns The issues.
 */
export function duplicateIdIssues(data: SagaExport): ImportIssue[] {
  const p = data.project;
  const epics = p.epics ?? [];
  const tasks = [...epics.flatMap((e) => e.tasks ?? []), ...(p.tasks ?? [])];
  return [...repeatedIds(epics, 'data.project.epics'), ...repeatedIds(p.stories ?? [], 'data.project.stories'), ...repeatedIds(tasks, 'data.project.tasks')];
}

/**
 * Finds a task that sits on a dependency cycle (iterative three-colour walk, linear in the
 * number of dependencies).
 * @param plan - Import plan.
 * @returns The id of a task on a cycle, or `undefined`.
 */
function taskOnCycle(plan: ImportPlan): string | undefined {
  const edges = new Map(plan.tasks.map((t) => [t.id, t.fields['depends_on'] as readonly string[]]));
  const state = new Map<string, 'open' | 'done'>();
  for (const start of edges.keys()) {
    const stack: Frame[] = state.has(start) ? [] : [{ node: start, next: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as Frame;
      const targets = edges.get(top.node) ?? [];
      state.set(top.node, 'open');
      if (top.next >= targets.length) {
        state.set(top.node, 'done');
        stack.pop();
        continue;
      }
      const target = targets[top.next] as string;
      top.next += 1;
      if (state.get(target) === 'open') {
        return target;
      }
      if (!state.has(target)) {
        stack.push({ node: target, next: 0 });
      }
    }
  }
  return undefined;
}

/**
 * Reports a dependency cycle among the planned tasks.
 * @param plan - Import plan.
 * @returns At most one issue.
 */
export function cycleIssues(plan: ImportPlan): ImportIssue[] {
  const id = taskOnCycle(plan);
  return id === undefined ? [] : [{ path: 'data.project.tasks', message: `the dependencies of the exported tasks form a cycle (new task ${id} is on it)` }];
}
