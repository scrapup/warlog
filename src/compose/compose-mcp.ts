/**
 * Composition root of `warlog mcp`: a live index (built at start, kept current by the watcher)
 * and the MCP adapter over stdio. Standard output carries only MCP frames; logs go to standard
 * error.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServerAdapter } from '../adapters/mcp/mcp-server.ts';
import type { OperationsFactory } from '../domain/operations.ts';
import { composeCore } from './compose-core.ts';

/**
 * Starts the MCP server on standard input/output.
 * @param operations - Registry content factory (default: the product operations).
 * @returns Once connected (the process then lives while stdin is open).
 */
export async function startMcpServer(operations?: OperationsFactory): Promise<void> {
  const core = composeCore({ index: 'live', ...(operations === undefined ? {} : { operations }) });
  await core.warmIndex();
  await new McpServerAdapter(core).connect(new StdioServerTransport());
}
