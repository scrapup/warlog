/**
 * MCP adapter (plan §4.3): one tool per registry entry over stdio. Validation, guards and
 * errors come from the mediator, never from the SDK, so the MCP and CLI behave identically
 * (WL-35). Standard output carries only MCP frames; logs go to standard error.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ExecuteDeps } from '../shared/execute-operation.ts';
import { executeOperation, formatError } from '../shared/execute-operation.ts';
import { toToolDescriptor } from './tool-mapper.ts';

/** Collaborators of the MCP adapter. */
export interface McpServerAdapterDeps extends ExecuteDeps {
  /** Package version reported to clients. */
  readonly version: string;
}

/**
 * Runs one tool call.
 * @param deps - Collaborators.
 * @param name - Tool name.
 * @param args - Tool arguments.
 * @returns The MCP result (`isError` on failure).
 */
export async function callTool(deps: ExecuteDeps, name: string, args: unknown): Promise<CallToolResult> {
  const outcome = await executeOperation(deps, name, args);
  if (!outcome.ok) {
    return { isError: true, content: [{ type: 'text', text: formatError(outcome.error) }] };
  }
  const warnings = outcome.warnings.length > 0 ? `\n\nwarnings: ${outcome.warnings.join(', ')}` : '';
  return { content: [{ type: 'text', text: `${outcome.text}${warnings}` }] };
}

/** Exposes the operation registry as MCP tools. */
export class McpServerAdapter {
  /** Collaborators. */
  private readonly deps: McpServerAdapterDeps;

  /**
   * Creates the adapter.
   * @param deps - Collaborators.
   */
  constructor(deps: McpServerAdapterDeps) {
    this.deps = deps;
  }

  /**
   * Builds the MCP server with the tools/list and tools/call handlers.
   * @returns The server (not yet connected).
   */
  createServer(): Server {
    const server = new Server({ name: 'warlog', version: this.deps.version }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.deps.registry.list().map(toToolDescriptor) }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(this.deps, request.params.name, request.params.arguments ?? {}));
    return server;
  }

  /**
   * Serves over a transport (stdio in production).
   * @param transport - MCP transport.
   * @returns The connected server.
   */
  async connect(transport: Transport): Promise<Server> {
    const server = this.createServer();
    await server.connect(transport);
    return server;
  }
}
