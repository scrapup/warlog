import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { productOperations } from '../../src/domain/operations.ts';
import { gitExecutable } from '../support/git-executable.ts';
import { isolatedEnv } from '../support/isolated-env.ts';
import type { IsolatedEnv } from '../support/isolated-env.ts';
import { connectMcp, resultText } from '../support/mcp-client.ts';
import type { McpSession } from '../support/mcp-client.ts';
import { packAndInstall } from '../support/packed-package.ts';
import { trackerHarness } from '../support/tracker-harness.ts';
import type { InstalledPackage } from '../support/packed-package.ts';

let installed: InstalledPackage | undefined;
let iso: IsolatedEnv | undefined;
let session: McpSession | undefined;

beforeAll(async () => {
  installed = packAndInstall();
  iso = isolatedEnv();
  session = await connectMcp([installed.bin, 'mcp'], { cwd: iso.cwd, env: iso.env, timeoutMs: 20_000 });
}, 300_000);

afterAll(async () => {
  await session?.close();
  iso?.dispose();
  installed?.dispose();
});

/**
 * Returns the session, failing clearly when setup did not complete.
 * @returns The MCP session.
 */
function mcp(): McpSession {
  if (session === undefined) {
    throw new Error('MCP session not started (see beforeAll failure)');
  }
  return session;
}

describe('warlog mcp from the packed tarball', () => {
  it('[WL-35] lists exactly the product registry', async () => {
    const { tools } = await mcp().client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(productOperations(trackerHarness().deps()).map((d) => d.name).sort());
  }, 30_000);

  it('[WL-45] answers doctor through MCP with a healthy report on an empty store', async () => {
    const result = await mcp().client.callTool({ name: 'doctor', arguments: {} });
    expect(result.isError ?? false).toBe(false);
    expect(resultText(result)).toContain('healthy: true');
  }, 30_000);

  it('[WL-40] answers an unknown tool with a stable error', async () => {
    const result = await mcp().client.callTool({ name: 'nope', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('VALIDATION: unknown operation nope');
  }, 30_000);

  it('[WL-16] [WL-18] [WL-20] saves, recalls and records memories, then answers the playbook and patterns_for', async () => {
    const call = async (name: string, args: Record<string, unknown>): Promise<string> => {
      const result = await mcp().client.callTool({ name, arguments: args });
      expect([name, result.isError ?? false]).toEqual([name, false]);
      return resultText(result);
    };
    await call('memory_save', { kind: 'pattern', title: 'ports first', content: 'inject side effects', applies_to: ['src/**/*.ts'] });
    await call('memory_save', { kind: 'known_issue', title: 'windows path bug', content: 'details', symptom: 'ENOENT', tags: ['win'] });
    expect(await call('memory_recall', { query: 'windows ENOENT', format: 'json' })).toContain('"count": 1');
    expect(await call('command_record', { cmd: 'npm run test:unit', outcome: 'ok', purpose: 'test', format: 'json' })).toContain('"status": "works"');
    const playbook = await call('playbook', { topic: 'test', format: 'json' });
    expect(JSON.parse(playbook)).toMatchObject({ commands: { works: [{ cmd: 'npm run test:unit', status: 'works' }] } });
    expect(JSON.parse(await call('patterns_for', { path: 'src/core/a.ts', format: 'json' }))).toMatchObject({ count: 1, patterns: [{ title: 'ports first' }] });
    expect(await call('var_set', { name: 'forge.parallel_executors', value: true, scope: 'global' })).toContain('rev: 1');
    expect(await call('var_get', { name: 'forge.parallel_executors' })).toBe('true');
    expect(await call('var_get', { name: 'forge.parallel_executors', format: 'yaml' })).toContain('scope: global');
  }, 60_000);

  it('[WL-29] [WL-31] [WL-32] [WL-33] runs an After-Action Review: define, respond, promote, recall', async () => {
    const repoEnv = isolatedEnv();
    execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: repoEnv.cwd });
    const repoSession = await connectMcp([installed?.bin ?? '', 'mcp'], { cwd: repoEnv.cwd, env: repoEnv.env, timeoutMs: 20_000 });
    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const result = await repoSession.client.callTool({ name, arguments: { ...args, format: 'json' } });
      expect([name, result.isError ?? false, resultText(result).slice(0, 200)]).toEqual([name, false, resultText(result).slice(0, 200)]);
      return JSON.parse(resultText(result)) as Record<string, unknown>;
    };
    expect(await call('questionnaire_get', { slug: 'aar' })).toMatchObject({ slug: 'aar', version: 1, builtin: true });
    const project = String((await call('project_create', { name: 'review' }))['id']);
    const bad = await repoSession.client.callTool({ name: 'response_create', arguments: { questionnaire: 'aar', subject_id: project, answers: { outcome: 'great' } } });
    expect(bad.isError).toBe(true);
    expect(resultText(bad)).toContain('VALIDATION');
    expect(resultText(bad)).toContain('answers.expected');
    const response = await call('response_create', {
      questionnaire: 'aar',
      subject_id: project,
      answers: { outcome: 'failure', trigger: 'release', expected: 'green', happened: 'red', why_difference: 'flaky test', improve: ['quarantine flaky tests'] },
    });
    expect(response).toMatchObject({ questionnaire: 'aar', subject: { type: 'project', id: project } });
    const promoted = await call('response_promote', { response_id: response['id'], question_id: 'improve', item_index: 0, scope: 'global' });
    expect(promoted['memory']).toMatchObject({ kind: 'guardrail', title: 'quarantine flaky tests', links: [{ rel: 'derived_from', target: response['id'] }] });
    expect(await call('memory_recall', { query: 'quarantine flaky' })).toMatchObject({ count: 1 });
    expect(await call('response_list', { questionnaire: 'aar' })).toMatchObject({ rows: [{ id: response['id'], answered: 6 }] });
    await repoSession.close();
    repoEnv.dispose();
  }, 60_000);

  it('[WL-57] [WL-73] registers a repository file by reference and reports it as changed after an edit', async () => {
    const repoEnv = isolatedEnv();
    execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: repoEnv.cwd });
    mkdirSync(join(repoEnv.cwd, 'docs', 'specs', 'core', 'ref'), { recursive: true });
    const file = join(repoEnv.cwd, 'docs', 'specs', 'core', 'ref', 'design.md');
    writeFileSync(file, '# D\n\n## One\n');
    const session2 = await connectMcp([installed?.bin ?? '', 'mcp'], { cwd: repoEnv.cwd, env: repoEnv.env, timeoutMs: 20_000 });
    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const result = await session2.client.callTool({ name, arguments: { ...args, format: 'json' } });
      expect([name, result.isError ?? false, resultText(result).slice(0, 200)]).toEqual([name, false, resultText(result).slice(0, 200)]);
      return JSON.parse(resultText(result)) as Record<string, unknown>;
    };
    const imported = await call('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference' });
    const id = String((imported['documents'] as { id: string }[])[0]?.id);
    expect(await call('doc_get', { id })).not.toHaveProperty('changed_since_registration');
    writeFileSync(file, '# D\n\n## One\n\n## Two\n');
    expect(await call('doc_get', { id })).toMatchObject({ changed_since_registration: true });
    expect(await call('doc_get', { id })).toMatchObject({ changed_since_registration: true });
    expect(await call('doctor', {})).toMatchObject({ document_references: [{ id, path: 'docs/specs/core/ref/design.md', status: 'changed' }] });
    await call('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference' });
    expect(await call('doc_get', { id })).not.toHaveProperty('changed_since_registration');
    expect(await call('doctor', {})).toMatchObject({ document_references: [] });
    const tools = (await session2.client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['doc_import', 'doc_get', 'doc_toc', 'doc_search', 'doc_list', 'doc_history', 'doc_versions', 'doc_export', 'doc_epic_list', 'opportunity_list']));
    await session2.close();
    repoEnv.dispose();
  }, 60_000);

  it('[WL-35] writes nothing but MCP frames on standard output and nothing on standard error', async () => {
    const current = mcp();
    await current.client.callTool({ name: 'nope', arguments: {} });
    await current.client.listTools();
    // Standard error is complete only after the server exits: this closes the shared session, so keep this test last.
    await current.close();
    session = undefined;
    expect(current.errors).toEqual([]);
    expect(current.stderr()).toBe('');
  }, 30_000);
});
