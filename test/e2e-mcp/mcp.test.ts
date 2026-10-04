import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { productOperations } from '../../src/domain/operations.ts';
import { isolatedEnv } from '../support/isolated-env.ts';
import type { IsolatedEnv } from '../support/isolated-env.ts';
import { connectMcp } from '../support/mcp-client.ts';
import type { McpSession } from '../support/mcp-client.ts';
import { packAndInstall } from '../support/packed-package.ts';
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
    expect(tools.map((t) => t.name).sort()).toEqual(productOperations().map((d) => d.name).sort());
  }, 30_000);

  it('[WL-40] answers an unknown tool with a stable error', async () => {
    const result = await mcp().client.callTool({ name: 'nope', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('VALIDATION: unknown operation nope');
  }, 30_000);

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
