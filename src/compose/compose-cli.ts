/**
 * Composition root of the command line: process streams, input files and the MCP entry.
 */
import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import type { CliDeps } from '../adapters/cli/cli-builder.ts';
import { composeCore } from './compose-core.ts';
import type { OperationsFactory } from './compose-core.ts';
import { startMcpServer } from './compose-mcp.ts';

/**
 * Wires the command line.
 * @param operations - Registry content factory (default: the product operations).
 * @returns Its collaborators.
 */
export function composeCli(operations?: OperationsFactory): CliDeps {
  const core = composeCore(operations);
  return {
    ...core,
    io: {
      stdout: (t) => {
        process.stdout.write(t);
      },
      stderr: (t) => {
        process.stderr.write(t);
      },
      readFile: (path) => readFile(path, 'utf8'),
      readStdin: () => text(process.stdin),
    },
    startMcp: () => startMcpServer(core),
  };
}
