import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { productOperations } from '../../src/domain/operations.ts';
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
