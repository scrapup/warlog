#!/usr/bin/env node
/**
 * warlog command-line entry point: `warlog <group> <action>` and `warlog mcp` (plan §4.4).
 */
import { runCli } from '../adapters/cli/cli-builder.ts';
import { composeCli, reportFatal } from '../compose/compose-cli.ts';

const args = process.argv.slice(2);

try {
  if (args.length === 1 && args[0] === 'mcp') {
    // The server composes its own (live) core: building the command line's core first would wire everything twice.
    const { startMcpServer } = await import('../compose/compose-mcp.ts');
    await startMcpServer();
  } else {
    process.exitCode = await runCli(args, composeCli());
  }
} catch (error: unknown) {
  process.exitCode = reportFatal(error);
}
