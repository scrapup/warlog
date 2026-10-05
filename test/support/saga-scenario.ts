/**
 * Test helper: the saga parity scenario (TF-97-09), run unchanged against `saga-mcp` (capture
 * script) and against warlog (parity test). Each step records a normalized observation, never raw
 * output: ids are replaced by the scenario's names (P, E, T1…), timestamps and formats are
 * dropped, so only behavior is compared.
 */

/** Version of `saga-mcp` the fixtures come from. */
export const SAGA_VERSION = '1.19.0';

/** Calls one tool and returns its result. */
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<{ isError: boolean; text: string }>;

/** One recorded observation. */
export interface StepResult {
  /** Step label. */
  readonly step: string;
  /** Normalized observation. */
  readonly observation: unknown;
}

/** A JSON object. */
type Json = Record<string, unknown>;

/**
 * Parses a JSON tool result (saga returns JSON text; warlog is asked for `format: json`).
 * @param text - Result text.
 * @returns The parsed value.
 */
function json(text: string): unknown {
  return JSON.parse(text);
}

/**
 * Rows of a list result (saga returns an array; warlog `{ rows }`).
 * @param value - Parsed result.
 * @returns The rows.
 */
function rowsOf(value: unknown): Json[] {
  if (Array.isArray(value)) {
    return value as Json[];
  }
  const rows = (value as Json)['rows'];
  return Array.isArray(rows) ? (rows as Json[]) : [];
}

/**
 * Picks fields of an object.
 * @param value - Object.
 * @param fields - Field names.
 * @returns The fields present.
 */
function pick(value: unknown, fields: readonly string[]): Json {
  const obj = value as Json;
  return Object.fromEntries(fields.filter((f) => obj[f] !== undefined && obj[f] !== null).map((f) => [f, obj[f]]));
}

/** Runs the steps and keeps the names of created ids. */
class ScenarioRun {
  /** Results so far. */
  readonly results: StepResult[] = [];
  /** Scenario names by id. */
  private readonly names = new Map<string, string>();
  /** Ids by scenario name. */
  private readonly ids = new Map<string, unknown>();
  /** Tool caller. */
  private readonly call: CallTool;

  /**
   * Creates the run.
   * @param call - Tool caller.
   */
  constructor(call: CallTool) {
    this.call = call;
  }

  /**
   * Id of a scenario name.
   * @param name - Name.
   * @returns The id.
   */
  id(name: string): unknown {
    return this.ids.get(name);
  }

  /**
   * Name of an id.
   * @param id - Id.
   * @returns The scenario name, or `?`.
   */
  name(id: unknown): string {
    return this.names.get(String(id)) ?? '?';
  }

  /**
   * Calls a tool; an error result is observed as `error`.
   * @param name - Tool.
   * @param args - Arguments.
   * @returns The parsed value, or `undefined` on error.
   */
  async tool(name: string, args: Json): Promise<unknown> {
    const raw = await this.call(name, args);
    return raw.isError ? undefined : json(raw.text);
  }

  /**
   * Creates an entity and names its id.
   * @param step - Step label.
   * @param tool - Tool.
   * @param args - Arguments.
   * @param name - Scenario name.
   * @param fields - Fields observed.
   * @returns When done.
   */
  async create(step: string, tool: string, args: Json, name: string, fields: readonly string[]): Promise<void> {
    const value = (await this.tool(tool, args)) as Json | undefined;
    if (value !== undefined) {
      this.ids.set(name, value['id']);
      this.names.set(String(value['id']), name);
    }
    this.observe(step, value === undefined ? 'error' : pick(value, fields));
  }

  /**
   * Records an observation.
   * @param step - Step label.
   * @param observation - Observation.
   */
  observe(step: string, observation: unknown): void {
    this.results.push({ step, observation });
  }
}

/**
 * Statuses of the scenario tasks.
 * @param run - Run.
 * @param names - Task names.
 * @returns Status by name.
 */
async function statuses(run: ScenarioRun, names: readonly string[]): Promise<Json> {
  const entries = await Promise.all(names.map(async (n) => [n, ((await run.tool('task_get', { id: run.id(n) })) as Json | undefined)?.['status'] ?? 'error'] as const));
  return Object.fromEntries(entries);
}

/**
 * Titles of an epic's tasks (sorted).
 * @param run - Run.
 * @param extra - Extra `task_list` arguments.
 * @returns Titles.
 */
async function titles(run: ScenarioRun, extra: Json = {}): Promise<string[]> {
  return rowsOf(await run.tool('task_list', { epic_id: run.id('E'), ...extra }))
    .map((r) => String(r['title']))
    .sort();
}

/**
 * Title of the recommended task.
 * @param run - Run.
 * @returns The title, or `null`.
 */
async function nextTitle(run: ScenarioRun): Promise<unknown> {
  const value = (await run.tool('tracker_next', {})) as Json | undefined;
  const task = value?.['task'] as Json | null | undefined;
  return task === null || task === undefined ? null : task['title'];
}

/**
 * Runs the scenario: project → epic → tasks with dependencies → status changes → automatic
 * block/unblock → next → soft delete/restore → cycle refusal → session diff.
 * @param call - Tool caller.
 * @returns The observations.
 */
export async function runScenario(call: CallTool): Promise<StepResult[]> {
  const run = new ScenarioRun(call);
  await run.create('project_create', 'project_create', { name: 'parity', description: 'saga parity' }, 'P', ['name', 'status', 'description']);
  await run.create('epic_create', 'epic_create', { project_id: run.id('P'), name: 'E1', priority: 'high' }, 'E', ['name', 'status', 'priority']);
  await run.create('task_create T1', 'task_create', { epic_id: run.id('E'), title: 'T1' }, 'T1', ['title', 'status', 'priority']);
  await run.create('task_create T2 depends on T1', 'task_create', { epic_id: run.id('E'), title: 'T2', depends_on: [run.id('T1')] }, 'T2', ['title', 'status']);
  await run.create('task_create T3 depends on T1, T2', 'task_create', { epic_id: run.id('E'), title: 'T3', priority: 'critical', depends_on: [run.id('T1'), run.id('T2')] }, 'T3', ['title', 'status', 'priority']);
  run.observe('next before work', await nextTitle(run));
  await run.tool('task_update', { id: run.id('T1'), status: 'in_progress' });
  run.observe('T1 in progress', await statuses(run, ['T1', 'T2', 'T3']));
  await run.tool('task_update', { id: run.id('T1'), status: 'done' });
  run.observe('T1 done releases T2 only', await statuses(run, ['T1', 'T2', 'T3']));
  run.observe('next after T1', await nextTitle(run));
  await run.tool('task_update', { id: run.id('T2'), status: 'done' });
  run.observe('T2 done releases T3', await statuses(run, ['T2', 'T3']));
  const t3 = (await run.tool('task_get', { id: run.id('T3') })) as Json;
  run.observe('task_get T3 dependencies', { depends_on: (t3['depends_on'] as Json[]).map((d) => [run.name(d['id']), d['status']]).sort(), dependents: (t3['dependents'] as Json[]).length });
  run.observe('task_update cycle', (await run.tool('task_update', { id: run.id('T1'), depends_on: [run.id('T3')] })) === undefined ? 'error' : 'accepted');
  await run.create('task_create T4', 'task_create', { epic_id: run.id('E'), title: 'T4' }, 'T4', ['title', 'status']);
  run.observe('task_delete started task', (await run.tool('task_delete', { id: run.id('T2') })) === undefined ? 'error' : 'accepted');
  await run.tool('task_delete', { id: run.id('T4'), reason: 'duplicate', deleted_by: 'parity' });
  run.observe('after soft delete', { live: await titles(run), with_deleted: await titles(run, { include_deleted: true }) });
  await run.tool('task_restore', { id: run.id('T4') });
  run.observe('after restore', await titles(run));
  const epics = rowsOf(await run.tool('epic_list', { project_id: run.id('P') }));
  run.observe('epic_list counts', epics.map((e) => pick(e, ['name', 'task_count', 'done_count', 'blocked_count'])));
  const diff = (await run.tool('tracker_session_diff', { since: '2000-01-01' })) as Json;
  run.observe('session diff', pick(diff['summary'], ['created', 'deleted']));
  return run.results;
}
