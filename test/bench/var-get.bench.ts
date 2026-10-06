import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gitExecutable } from '../support/git-executable.ts';
import { runNode } from '../support/run-node.ts';
import { generateStore } from '../support/store-generator.ts';

/** Target of the whole `warlog var get` process (plan §3.7, p95, warm file system). */
const TARGET_MS = 150;
/** Hard bound that only catches a regression to a full index scan (informative otherwise). */
const BOUND_MS = 2_500;
/** Runs measured. */
const RUNS = 20;

let base = '';

beforeAll(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'warlog-var-bench-')));
  const store = generateStore(base, 10_000);
  const work = join(base, 'repo');
  execFileSync(gitExecutable(), ['init', '-q', '-b', 'main'], { cwd: work });
  mkdirSync(join(store.globalRoot, 'global', 'vars'), { recursive: true });
}, 120_000);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('var get benchmark', () => {
  it('[SLA] reads a variable of a 10 000-file store without scanning it', () => {
    const entry = resolve(existsSync('dist/bin/warlog.js') ? join('dist', 'bin', 'warlog.js') : join('src', 'bin', 'warlog.ts'));
    const env = { WARLOG_DIR: join(base, 'global'), HOME: base, USERPROFILE: base, XDG_CONFIG_HOME: join(base, 'config'), WARLOG_PROJECT: '' };
    const cwd = join(base, 'repo');
    const run = (args: string[]): ReturnType<typeof runNode> => runNode([entry, ...args], { cwd, env, timeoutMs: 20_000 });
    const set = run(['var', 'set', 'forge.parallel_executors', '--value', 'true', '--scope', 'global']);
    expect([set.status, set.stderr]).toEqual([0, '']);
    run(['var', 'get', 'forge.parallel_executors']);
    const times = Array.from({ length: RUNS }, () => {
      const started = performance.now();
      const result = run(['var', 'get', 'forge.parallel_executors']);
      expect(result.stdout).toBe('true\n');
      return performance.now() - started;
    }).sort((a, b) => a - b);
    const p95 = times[Math.ceil(RUNS * 0.95) - 1] ?? 0;
    const median = times[Math.floor(RUNS / 2)] ?? 0;
    process.stdout.write(`var-get: median ${median.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (target ${TARGET_MS} ms, whole process, ${RUNS} runs, ${process.platform})\n`);
    expect(p95).toBeLessThan(BOUND_MS);
  }, 120_000);
});
