import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isolatedEnv } from '../support/isolated-env.ts';
import type { IsolatedEnv } from '../support/isolated-env.ts';
import { connectMcp, resultText } from '../support/mcp-client.ts';
import type { McpSession } from '../support/mcp-client.ts';
import { runScenario } from '../support/saga-scenario.ts';
import type { CallTool, StepResult } from '../support/saga-scenario.ts';
import { DEVIATIONS, compareTools } from '../support/schema-parity.ts';
import type { ToolSchema } from '../support/schema-parity.ts';

const BIN = join(process.cwd(), 'src', 'bin', 'warlog.ts');
const FIXTURES = join(process.cwd(), 'test', 'fixtures', 'saga');

/**
 * Reads a saga fixture (captured by scripts/capture-saga-fixtures.ts, never edited by hand).
 * @param name - File name.
 * @returns Parsed JSON.
 */
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as T;
}

/**
 * Starts warlog's MCP server in a fresh git repository.
 * @returns Environment and session.
 */
async function startWarlog(): Promise<{ iso: IsolatedEnv; mcp: McpSession }> {
  const iso = isolatedEnv();
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: iso.cwd });
  const mcp = await connectMcp([BIN, 'mcp'], { cwd: iso.cwd, env: iso.env, timeoutMs: 20_000 });
  return { iso, mcp };
}

/**
 * Tool caller over a session, asking for JSON results.
 * @param mcp - Session.
 * @returns The caller.
 */
function caller(mcp: McpSession): CallTool {
  return async (name, args) => {
    const result = await mcp.client.callTool({ name, arguments: { ...args, format: 'json' } });
    return { isError: result.isError === true, text: resultText(result) };
  };
}

let scenarioEnv: { iso: IsolatedEnv; mcp: McpSession } | undefined;
let importEnv: { iso: IsolatedEnv; mcp: McpSession } | undefined;

beforeAll(async () => {
  [scenarioEnv, importEnv] = await Promise.all([startWarlog(), startWarlog()]);
}, 60_000);

afterAll(async () => {
  for (const env of [scenarioEnv, importEnv]) {
    await env?.mcp.close();
    env?.iso.dispose();
  }
});

/**
 * Returns a started environment, failing clearly when setup did not complete.
 * @param env - Environment.
 * @returns It.
 */
function ready(env: { iso: IsolatedEnv; mcp: McpSession } | undefined): { iso: IsolatedEnv; mcp: McpSession } {
  if (env === undefined) {
    throw new Error('warlog MCP not started (see beforeAll failure)');
  }
  return env;
}

describe('saga parity contract', () => {
  it('[WL-10] [WL-11] every tool of the current tracker exists with the same parameters; only the plan §1.1 deviations differ', async () => {
    const saga = fixture<{ tools: ToolSchema[] }>('tools-list.json').tools;
    const { tools } = await ready(scenarioEnv).mcp.client.listTools();
    expect(saga).toHaveLength(41);
    expect(compareTools(saga, tools as ToolSchema[])).toEqual([]);
    const names = new Set(tools.map((t) => t.name));
    expect(['note_restore', 'story_create', 'story_get', 'story_list', 'story_update', 'story_archive'].every((n) => names.has(n))).toBe(true);
    expect(DEVIATIONS.addedParameters).toEqual({ task_create: ['code', 'story_id'], task_list: ['story_id'], task_update: ['code'] });
    expect(DEVIATIONS.relaxedRequired).toEqual({ task_create: ['epic_id'] });
  });

  it('[WL-10] [WL-13] the behavioral scenario gives the same normalized results as the current tracker', async () => {
    const expected = fixture<{ results: StepResult[] }>('scenario-results.json').results;
    expect(await runScenario(caller(ready(scenarioEnv).mcp))).toEqual(expected);
  }, 60_000);

  it('[WL-14] an export of the current tracker imports with remapped ids and exports back the same plan', async () => {
    const call = caller(ready(importEnv).mcp);
    const source = fixture<{ project: { name: string; epics: { name: string; tasks: { title: string; status: string; priority: string; depends_on: number[] }[] }[] } }>('export.json');
    const imported = await call('tracker_import', { data: source });
    expect(imported.isError).toBe(false);
    const result = JSON.parse(imported.text) as { project_id: string; counts: Record<string, number> };
    expect(result.counts).toEqual({ epics: 1, stories: 0, tasks: 4, subtasks: 0, comments: 0, dependencies: 3, notes: 0 });
    const exported = JSON.parse((await call('tracker_export', { project_id: result.project_id })).text) as typeof source;
    /**
     * Plan of an export: tasks by title with status, priority and dependencies by title.
     * @param data - Export.
     * @returns Normalized plan.
     */
    const plan = (data: typeof source): unknown =>
      data.project.epics.map((e) => {
        const titleOf = new Map<unknown, string>(e.tasks.map((t) => [(t as unknown as { _original_id: unknown })._original_id, t.title]));
        return { name: e.name, tasks: e.tasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority, depends_on: t.depends_on.map((d) => titleOf.get(d)) })) };
      });
    expect(plan(exported)).toEqual(plan(source));
    expect(exported.project.name).toBe(source.project.name);
  }, 60_000);
});
