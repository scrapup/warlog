/**
 * Lifecycle of the MCP server process: a long-running process that ends cleanly on a signal and
 * leaves a trace, with codes only, when it ends because of an error that nobody handled. Without
 * it the process dies with a raw stack on standard error (home folder included) and the watcher
 * is never stopped.
 */
import { errorFields } from '../core/errors/error-fields.ts';
import type { Logger } from '../core/ports/logger.port.ts';

/** The parts of `process` the lifecycle uses. */
export interface ProcessLike {
  /**
   * Registers a listener.
   * @param event - Event name.
   * @param listener - Listener.
   * @returns The process.
   */
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  /**
   * Ends the process.
   * @param code - Exit code.
   */
  exit(code: number): void;
}

/** What the lifecycle needs to know about the server. */
export interface LifecycleDeps {
  /** Process. */
  readonly proc: ProcessLike;
  /** Logger (codes only). */
  readonly logger: Logger;
  /** Releases the index and its watcher. */
  readonly close: () => void;
  /** Closes the transport (resolves once closed). */
  readonly closeServer: () => Promise<void>;
}

/** Signals that end the server cleanly. */
const SIGNALS = ['SIGINT', 'SIGTERM'];

/**
 * Registers the handlers: a signal closes the server and exits with 0; an uncaught exception or
 * unhandled rejection is logged (`process.fatal`, codes only), releases the watcher and exits with 1.
 * @param deps - Collaborators.
 */
export function installLifecycle(deps: LifecycleDeps): void {
  const { proc, logger } = deps;
  for (const signal of SIGNALS) {
    proc.on(signal, () => {
      logger.log('info', 'mcp.shutdown', { signal });
      deps.close();
      void deps.closeServer().finally(() => proc.exit(0));
    });
  }
  for (const kind of ['uncaughtException', 'unhandledRejection']) {
    proc.on(kind, (error: unknown) => {
      logger.log('error', 'process.fatal', { kind, ...errorFields(error) });
      deps.close();
      proc.exit(1);
    });
  }
}
