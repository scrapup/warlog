/**
 * Test helper: runs Node scripts as real processes.
 */
import { spawnSync } from 'node:child_process';

/** Captured result of a process run. */
export interface ProcessResult {
  /** Exit code (`null` when killed). */
  readonly status: number | null;
  /** Captured standard output. */
  readonly stdout: string;
  /** Captured standard error. */
  readonly stderr: string;
}

/**
 * Runs `node <args>` synchronously with a timeout.
 * @param args - Node arguments (script and its arguments).
 * @param options - Working directory and extra environment.
 * @param options.cwd - Working directory.
 * @param options.env - Extra environment variables.
 * @returns The captured result.
 */
export function runNode(args: readonly string[], options: { cwd?: string; env?: Record<string, string> } = {}): ProcessResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
