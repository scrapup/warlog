/**
 * Composition root of the command line: process streams, input files, the MCP entry and the
 * report of a failure while wiring.
 */
import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import type { CliDeps } from '../adapters/cli/cli-builder.ts';
import { EXIT_ERROR } from '../adapters/cli/exit-codes.ts';
import { formatError } from '../adapters/shared/execute-operation.ts';
import { ProcessEnv } from '../core/adapters/process-env.ts';
import { errorFields } from '../core/errors/error-fields.ts';
import { redactError } from '../core/errors/path-redactor.ts';
import type { Redaction } from '../core/errors/path-redactor.ts';
import { toWarlogError } from '../core/errors/warlog-error.ts';
import type { OperationsFactory } from '../domain/operations.ts';
import { composeCore, composeLogger, staticRedactions } from './compose-core.ts';

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
    startMcp: async () => {
      // Loaded on demand: the MCP SDK stays out of every other command's startup.
      const { startMcpServer } = await import('./compose-mcp.ts');
      await startMcpServer(core);
    },
  };
}

/**
 * Reports a failure that escaped the command line (e.g. an invalid registry while wiring): logs
 * codes only and prints the stable, redacted error. Never throws.
 * @param error - Thrown value.
 * @returns The exit code.
 */
export function reportFatal(error: unknown): number {
  let redactions: Redaction[] = [];
  try {
    const env = new ProcessEnv();
    composeLogger(env).log('error', 'cli.failed', { ...errorFields(error) });
    redactions = staticRedactions(env);
  } catch {
    // The environment itself is broken: print the error without redaction placeholders.
  }
  process.stderr.write(`${formatError(redactError(toWarlogError(error), redactions))}\n`);
  return EXIT_ERROR;
}
