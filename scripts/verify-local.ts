/**
 * `npm run verify:local`: runs the same steps as the CI `verify` job (plan §7.5), writing
 * the Jest JSON reports consumed by `rules:coverage` into `reports/`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

/** Ordered npm script invocations (script name and extra arguments). */
// Keep in sync with the `verify` job steps of .github/workflows/ci.yml.
const STEPS: readonly (readonly [string, ...string[]])[] = [
  ['typecheck'],
  ['lint'],
  ['test:unit', '--coverage', '--json', '--outputFile=reports/jest-unit.json'],
  ['build'],
  ['test:integration', '--json', '--outputFile=reports/jest-integration.json'],
  ['test:e2e', '--json', '--outputFile=reports/jest-e2e.json'],
  ['rules:coverage', '--allow-missing', 'scripts/rules-pending.txt'],
  ['bench', '--ci'],
];

rmSync('reports', { recursive: true, force: true });
mkdirSync('reports');
for (const [script, ...args] of STEPS) {
  process.stdout.write(`\nverify:local step: npm run ${script}\n`);
  const npmArgs = args.length > 0 ? ['run', script, '--', ...args] : ['run', script];
  const result = spawnSync('npm', npmArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.stderr.write(`verify:local failed at ${script}${result.error ? `: ${result.error.message}` : ''}\n`);
    process.exitCode = result.status ?? 1;
    break;
  }
}
if (process.exitCode === undefined) {
  process.stdout.write('\nverify:local passed\n');
}
