/**
 * Composition root of `warlog mcp`: the MCP adapter over stdio. Standard output carries only MCP
 * frames; logs go to standard error.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServerAdapter } from '../adapters/mcp/mcp-server.ts';
import type { Core } from './compose-core.ts';

/**
 * Starts the MCP server on standard input/output.
 * @param core - Wired call path.
 * @returns Once connected (the process then lives while stdin is open).
 */
export async function startMcpServer(core: Core): Promise<void> {
  await new McpServerAdapter(core).connect(new StdioServerTransport());
}
