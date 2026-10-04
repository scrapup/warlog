#!/usr/bin/env node
/**
 * warlog command-line entry point: `warlog <group> <action>` and `warlog mcp` (plan §4.4).
 */
import { runCli } from '../adapters/cli/cli-builder.ts';
import { composeCli } from '../compose/compose-cli.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2), composeCli());
} catch (error: unknown) {
  const detail = process.env['WARLOG_LOG_LEVEL'] === 'debug' && error instanceof Error ? `\n${error.stack ?? ''}` : '';
  process.stderr.write(`INTERNAL: internal error${detail}\n`);
  process.exitCode = 1;
}
