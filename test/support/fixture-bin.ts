/**
 * Test helper: the real composition roots over the fixture registry, run as a process by the
 * interface-parity test (`node test/support/fixture-bin.ts <args>`).
 */
import { runCli } from '../../src/adapters/cli/cli-builder.ts';
import { composeCli } from '../../src/compose/compose-cli.ts';
import { FIXTURE_OPERATIONS } from './fixture-operations.ts';

process.exitCode = await runCli(process.argv.slice(2), composeCli(() => FIXTURE_OPERATIONS));
