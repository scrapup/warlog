/**
 * Task dependency rules (WL-13), pure: cycle detection, unmet dependencies and the automatic
 * block/unblock decision. A dependency whose task is missing (not synced yet, WL-44) counts as
 * unmet, so the dependent stays blocked until it arrives and is done.
 */

/** Status a dependency must reach to be met. */
const DONE = 'done';

/** Outcome of evaluating a task against its dependencies. */
export interface StatusDecision {
  /** Status to store. */
  readonly status: string;
  /** Automatic transition applied, when any. */
  readonly transition?: 'auto_blocked' | 'auto_unblocked';
}

/** One node being explored by the depth-first search. */
interface Frame {
  /** Task id. */
  readonly node: string;
  /** Index of the next dependency to explore. */
  next: number;
}

/**
 * Finds the cycle a new dependency list would create.
 * @param edges - Current dependencies by task id.
 * @param id - Task whose dependencies are replaced.
 * @param dependsOn - New dependencies of `id`.
 * @returns The cycle as a path starting and ending at the repeated id, or `undefined`.
 */
export function findCycle(edges: ReadonlyMap<string, readonly string[]>, id: string, dependsOn: readonly string[]): string[] | undefined {
  const graph = new Map(edges);
  graph.set(id, dependsOn);
  const done = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();
  const stack: Frame[] = [{ node: id, next: 0 }];
  path.push(id);
  onPath.add(id);
  while (stack.length > 0) {
    const top = stack[stack.length - 1] as Frame;
    const targets = graph.get(top.node) ?? [];
    if (top.next >= targets.length) {
      stack.pop();
      path.pop();
      onPath.delete(top.node);
      done.add(top.node);
      continue;
    }
    const target = targets[top.next] as string;
    top.next += 1;
    if (onPath.has(target)) {
      return [...path.slice(path.indexOf(target)), target];
    }
    if (!done.has(target)) {
      stack.push({ node: target, next: 0 });
      path.push(target);
      onPath.add(target);
    }
  }
  return undefined;
}

/**
 * Normalizes a dependency list: no duplicates, never the task itself.
 * @param id - Task id.
 * @param dependsOn - Requested dependencies.
 * @returns The clean list, in request order.
 */
export function cleanDependencies(id: string, dependsOn: readonly string[]): string[] {
  return [...new Set(dependsOn)].filter((d) => d !== id);
}

/**
 * Dependencies that are not done (missing tasks included).
 * @param dependsOn - Dependency ids.
 * @param statusOf - Status of a task id (`undefined` when not in the view).
 * @returns Unmet ids, in list order.
 */
export function unmetDependencies(dependsOn: readonly string[], statusOf: (id: string) => string | undefined): string[] {
  return dependsOn.filter((d) => statusOf(d) !== DONE);
}

/**
 * Decides the status of a task after its dependencies were evaluated. A task with no
 * dependencies is left alone (`blocked` may be a human decision) unless its list was just
 * edited — then a task the system blocked is released.
 * @param status - Current (or requested) status.
 * @param dependencyCount - Number of dependencies.
 * @param unmet - Unmet dependency count.
 * @param dependenciesChanged - Whether the dependency list was just edited.
 * @returns The status to store and the transition applied.
 */
export function decideStatus(status: string, dependencyCount: number, unmet: number, dependenciesChanged: boolean): StatusDecision {
  if (dependencyCount === 0 && !dependenciesChanged) {
    return { status };
  }
  if (unmet > 0 && status !== 'blocked' && status !== DONE) {
    return { status: 'blocked', transition: 'auto_blocked' };
  }
  if (unmet === 0 && status === 'blocked') {
    return { status: 'todo', transition: 'auto_unblocked' };
  }
  return { status };
}
