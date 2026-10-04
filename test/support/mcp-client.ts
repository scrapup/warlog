/**
 * Test helper: drives a spawned `warlog mcp` through the MCP SDK stdio client, with a timeout and
 * captured standard error.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

/** A connected MCP session over a child process. */
export interface McpSession {
  /** Client. */
  readonly client: Client;
  /** Standard error captured so far. */
  readonly stderr: () => string;
  /** Transport errors (e.g. non-MCP bytes on standard output). */
  readonly errors: Error[];
  /** Closes the client and the child process. */
  readonly close: () => Promise<void>;
}

/** Options of a session. */
export interface McpSessionOptions {
  /** Working directory. */
  readonly cwd: string;
  /** Extra environment variables. */
  readonly env: Record<string, string>;
  /** Connection timeout (default 10 s). */
  readonly timeoutMs?: number;
}

/**
 * Spawns `node <args>` and connects an MCP client to it.
 * @param args - Node arguments (script and `mcp`).
 * @param options - Session options.
 * @returns The session.
 * @throws {Error} With the captured stderr when the connection does not complete in time.
 */
export async function connectMcp(args: readonly string[], options: McpSessionOptions): Promise<McpSession> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [...args],
    cwd: options.cwd,
    env: { ...getDefaultEnvironment(), ...options.env },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const errors: Error[] = [];
  const client = new Client({ name: 'warlog-test', version: '0' });
  client.onerror = (error) => errors.push(error);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`MCP connect timed out; stderr:\n${stderr}`)), options.timeoutMs ?? 10_000);
  });
  try {
    await Promise.race([client.connect(transport), timeout]);
  } catch (error: unknown) {
    await transport.close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return { client, stderr: () => stderr, errors, close: () => client.close() };
}

/**
 * Text of the first content item of a tool result.
 * @param result - Tool result.
 * @returns Its text.
 */
export function resultText(result: unknown): string {
  const content = (result as { content?: { text?: string }[] }).content ?? [];
  return content[0]?.text ?? '';
}
