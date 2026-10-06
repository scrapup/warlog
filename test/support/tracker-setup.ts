/**
 * Test helper: builds tracker fixtures through the harness and captures failures.
 */
import type { TrackerHarness } from './tracker-harness.ts';

/** Ids of a project and an epic. */
export interface Container {
  /** Project id. */
  readonly projectId: string;
  /** Epic id. */
  readonly epicId: string;
}

/**
 * Captures the error of a promise.
 * @param promise - Promise expected to fail.
 * @returns The error.
 */
export async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a failure');
    },
    (error: unknown) => error,
  );
}

/**
 * Creates a project and an epic.
 * @param h - Harness.
 * @param epic - Extra epic fields.
 * @returns Their ids.
 */
export async function container(h: TrackerHarness, epic: Record<string, unknown> = {}): Promise<Container> {
  const projectId = String((await h.obj('project_create', { name: 'p' }))['id']);
  const epicId = String((await h.obj('epic_create', { project_id: projectId, name: 'E', ...epic }))['id']);
  return { projectId, epicId };
}

/**
 * Creates a task.
 * @param h - Harness.
 * @param epicId - Epic.
 * @param title - Title.
 * @param extra - Extra fields.
 * @returns The task row.
 */
export async function task(h: TrackerHarness, epicId: string, title: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return h.obj('task_create', { epic_id: epicId, title, ...extra });
}

/**
 * Reads a task's status.
 * @param h - Harness.
 * @param id - Task id.
 * @returns The status.
 */
export async function statusOf(h: TrackerHarness, id: unknown): Promise<unknown> {
  return (await h.obj('task_get', { id }))['status'];
}
