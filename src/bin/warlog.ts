#!/usr/bin/env node
/**
 * warlog command-line entry point: `warlog <group> <action>` and `warlog mcp` (plan §4.4).
 */
import { runCli } from '../adapters/cli/cli-builder.ts';
import { composeCli, reportFatal } from '../compose/compose-cli.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2), composeCli());
} catch (error: unknown) {
  process.exitCode = reportFatal(error);
}
