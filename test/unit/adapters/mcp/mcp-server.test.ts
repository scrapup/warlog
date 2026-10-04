import { describe, expect, it } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerAdapter, callTool } from '../../../../src/adapters/mcp/mcp-server.ts';
import { toToolDescriptor } from '../../../../src/adapters/mcp/tool-mapper.ts';
import type { OperationDefinition } from '../../../../src/core/mediator/operation-definition.ts';
import { fixtureDeps } from '../../../support/fixture-deps.ts';
import { FIXTURE_OPERATIONS, fixtureOperation } from '../../../support/fixture-operations.ts';

/**
 * Connects a client to the adapter over an in-memory transport.
 * @param operations - Registry content.
 * @returns The connected client.
 */
async function connect(operations: readonly OperationDefinition[] = FIXTURE_OPERATIONS): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await new McpServerAdapter({ ...fixtureDeps(operations), version: '1.2.3' }).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  return client;
}

/**
 * Text of the first content item.
 * @param result - Tool result.
 * @returns Its text.
 */
function textOf(result: unknown): string {
  return ((result as { content: { text: string }[] }).content[0] ?? { text: '' }).text;
}

describe('MCP adapter', () => {
  it('[WL-35] lists one tool per registry entry with strict input schemas and output options', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(fixtureDeps().registry.list().map((d) => d.name));
    expect(tools).toHaveLength(FIXTURE_OPERATIONS.length);
    const echo = tools.find((t) => t.name === 'fixture_echo');
    expect(echo?.inputSchema).toMatchObject({ type: 'object', required: ['text'], additionalProperties: false });
    expect(Object.keys(echo?.inputSchema.properties ?? {})).toEqual(['text', 'count', 'format', 'fields']);
    await client.close();
  });

  it('[WL-35] calls tools through the mediator and renders like the command line', async () => {
    const client = await connect();
    expect(textOf(await client.callTool({ name: 'fixture_echo', arguments: { text: 'hi', count: 2 } }))).toBe('text: hi\ncount: 2');
    expect(textOf(await client.callTool({ name: 'fixture_value', arguments: { name: 'flag' } }))).toBe('false');
    await client.close();
  });

  it('[WL-40] returns stable errors as isError results', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'fixture_fail', arguments: { code: 'CONFLICT' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^CONFLICT: fixture CONFLICT\nreason: fixture/);
    expect(textOf(await client.callTool({ name: 'fixture_echo' }))).toMatch(/^VALIDATION: invalid input/);
    const unknown = await client.callTool({ name: 'nope', arguments: {} });
    expect(textOf(unknown)).toMatch(/^VALIDATION: unknown operation nope/);
    await client.close();
  });

  it('[WL-38] rejects invalid output options with a validation error', async () => {
    const deps = fixtureDeps();
    const result = await callTool(deps, 'fixture_echo', { text: 'x', format: 'xml' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^VALIDATION: invalid output options/);
    expect(textOf(await callTool(deps, 'fixture_echo', 'not-an-object'))).toMatch(/^VALIDATION: arguments must be an object/);
  });

  it('appends warnings to the result text', async () => {
    const warn: OperationDefinition = {
      ...fixtureOperation('fixture_echo'),
      handler: {
        handle: async (_input, context) => {
          context.warnings.push('W1', 'W1');
          return { kind: 'scalar', value: 'ok' };
        },
      },
    };
    expect(textOf(await callTool(fixtureDeps([warn]), 'fixture_echo', { text: 'x' }))).toBe('ok\n\nwarnings: W1');
  });

  it('describes operations without required fields without a required list', () => {
    const list = fixtureOperation('fixture_list');
    expect(toToolDescriptor(list).inputSchema.required).toBeUndefined();
  });
});
