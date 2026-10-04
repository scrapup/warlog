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

/** Options of a process run. */
export interface RunNodeOptions {
  /** Working directory (default: current). */
  readonly cwd?: string;
  /** Extra environment variables. */
  readonly env?: Record<string, string>;
  /** Kill timeout in milliseconds; keep it below the Jest test timeout (default 110 s). */
  readonly timeoutMs?: number;
}

/**
 * Runs `node <args>` synchronously with a timeout.
 * @param args - Node arguments (script and its arguments).
 * @param options - Run options.
 * @returns The captured result.
 */
export function runNode(args: readonly string[], options: RunNodeOptions = {}): ProcessResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 110_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
