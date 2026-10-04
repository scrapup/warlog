/**
 * `npm run rules:coverage` entry point: wires the Node file system into the runner.
 */
import { runFromArgs } from './rules-coverage/runner.ts';
import { NodeFileSystem } from '../src/core/adapters/node-file-system.ts';

const outcome = await runFromArgs(process.argv.slice(2), new NodeFileSystem());
(outcome.exitCode === 0 ? process.stdout : process.stderr).write(`${outcome.message}\n`);
process.exitCode = outcome.exitCode;
