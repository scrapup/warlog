/**
 * `npm run rules:coverage` entry point: wires the Node file system into the runner.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RulesFileSystem } from './rules-coverage/file-system.ts';
import { runFromArgs } from './rules-coverage/runner.ts';

/** Node implementation of the script's file-system port. */
const nodeFs: RulesFileSystem = {
  readText: (path) => readFile(path, 'utf8'),
  writeText: async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  },
  listDir: (path) => readdir(path),
};

const outcome = await runFromArgs(process.argv.slice(2), nodeFs);
(outcome.exitCode === 0 ? process.stdout : process.stderr).write(`${outcome.message}\n`);
process.exitCode = outcome.exitCode;
