#!/usr/bin/env node
/**
 * warlog command-line entry point: `warlog <group> <action>` and `warlog mcp` (plan §4.4).
 * A failure while wiring (e.g. an invalid registry) is reported like any other error.
 */
import { runCli } from '../adapters/cli/cli-builder.ts';
import { EXIT_ERROR } from '../adapters/cli/exit-codes.ts';
import { formatError } from '../adapters/shared/execute-operation.ts';
import { composeCli } from '../compose/compose-cli.ts';
import { staticRedactions } from '../compose/compose-core.ts';
import { ProcessEnv } from '../core/adapters/process-env.ts';
import { StderrJsonLogger, parseLogLevel } from '../core/adapters/stderr-json-logger.ts';
import { errorFields } from '../core/errors/error-fields.ts';
import { redactError } from '../core/errors/path-redactor.ts';
import { toWarlogError } from '../core/errors/warlog-error.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2), composeCli());
} catch (error: unknown) {
  const env = new ProcessEnv();
  new StderrJsonLogger(parseLogLevel(env.get('WARLOG_LOG_LEVEL'))).log('error', 'cli.failed', { ...errorFields(error) });
  process.stderr.write(`${formatError(redactError(toWarlogError(error), staticRedactions(env)))}\n`);
  process.exitCode = EXIT_ERROR;
}
