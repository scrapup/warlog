/**
 * Test helper: the entry point over a registry that fails to build, to prove the report of a
 * failure while wiring (`node test/support/invalid-registry-bin.ts`).
 */
import { runCli } from '../../src/adapters/cli/cli-builder.ts';
import { composeCli, reportFatal } from '../../src/compose/compose-cli.ts';
import { fixtureOperation } from './fixture-operations.ts';

try {
  process.exitCode = await runCli(process.argv.slice(2), composeCli(() => [{ ...fixtureOperation('fixture_echo'), description: '' }]));
} catch (error: unknown) {
  process.exitCode = reportFatal(error);
}
