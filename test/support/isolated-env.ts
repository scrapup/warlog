/**
 * Test helper: a throw-away home, store and working directory for spawned warlog processes.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Isolated directories and the environment pointing at them. */
export interface IsolatedEnv {
  /** Working directory (not a git repository). */
  readonly cwd: string;
  /** Global store root (`WARLOG_DIR`). */
  readonly store: string;
  /** Environment variables for the child process. */
  readonly env: Record<string, string>;
  /** Removes every directory. */
  readonly dispose: () => void;
}

/**
 * Creates the isolated directories.
 * @returns The environment.
 */
export function isolatedEnv(): IsolatedEnv {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'warlog-iso-')));
  const dirs = { cwd: join(root, 'work'), store: join(root, 'store'), home: join(root, 'home'), config: join(root, 'config') };
  Object.values(dirs).forEach((dir) => mkdirSync(dir, { recursive: true }));
  const env = { WARLOG_DIR: dirs.store, HOME: dirs.home, USERPROFILE: dirs.home, XDG_CONFIG_HOME: dirs.config, WARLOG_PROJECT: '' };
  return { cwd: dirs.cwd, store: dirs.store, env, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
