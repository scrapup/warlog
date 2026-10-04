/**
 * Test helper: the entry point over a registry factory that fails while wiring, with a local
 * path in the error, to prove the report of such a failure (`node test/support/invalid-registry-bin.ts`).
 */
import { homedir } from 'node:os';
import { runCli } from '../../src/adapters/cli/cli-builder.ts';
import { composeCli, reportFatal } from '../../src/compose/compose-cli.ts';
import { WarlogError } from '../../src/core/errors/warlog-error.ts';

try {
  process.exitCode = await runCli(
    process.argv.slice(2),
    composeCli(() => {
      throw new WarlogError('INTERNAL', `cannot load operations from ${homedir()}/plugins`);
    }),
  );
} catch (error: unknown) {
  process.exitCode = reportFatal(error);
}
