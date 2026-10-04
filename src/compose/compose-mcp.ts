/**
 * Composition root of `warlog mcp`: a live index (built at start, kept current by the watcher,
 * released when the client disconnects) and the MCP adapter over stdio. Standard output carries
 * only MCP frames; logs go to standard error.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServerAdapter } from '../adapters/mcp/mcp-server.ts';
import { errorFields } from '../core/errors/error-fields.ts';
import type { OperationsFactory } from '../domain/operations.ts';
import { composeCore } from './compose-core.ts';

/**
 * Starts the MCP server on standard input/output. A failed index build at start is logged and
 * retried by the first call that needs it, which then reports the stable error.
 * @param operations - Registry content factory (default: the product operations).
 * @returns Once connected (the process then lives while stdin is open).
 */
export async function startMcpServer(operations?: OperationsFactory): Promise<void> {
  const core = composeCore({ index: 'live', ...(operations === undefined ? {} : { operations }) });
  await core.warmIndex().catch((error: unknown) => core.logger.log('warn', 'index.warm_failed', { ...errorFields(error) }));
  const server = await new McpServerAdapter(core).connect(new StdioServerTransport());
  const logClose = server.onclose;
  server.onclose = () => {
    logClose?.();
    core.close();
  };
}
