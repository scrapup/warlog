/**
 * JSON-lines implementation of the {@link Logger} port. Writes to standard error only:
 * standard output is reserved for command results and MCP frames.
 */
import type { LogLevel, Logger } from '../ports/logger.port.ts';

/** Numeric order of levels. */
const ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Parses a level name, defaulting to `warn`.
 * @param value - Raw level (e.g. `WARLOG_LOG_LEVEL`).
 * @returns The level.
 */
export function parseLogLevel(value: string | undefined): LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : 'warn';
}

/** Logger writing one JSON object per line to a sink (standard error by default). */
export class StderrJsonLogger implements Logger {
  /** Minimum level written. */
  private readonly threshold: LogLevel;
  /** Line sink. */
  private readonly write: (line: string) => void;
  /** Time source for the `ts` field. */
  private readonly now: () => Date;

  /**
   * Creates the logger.
   * @param threshold - Minimum level written.
   * @param write - Line sink (defaults to standard error).
   * @param now - Time source (defaults to the system clock).
   */
  constructor(threshold: LogLevel, write?: (line: string) => void, now?: () => Date) {
    this.threshold = threshold;
    this.write = write ?? ((line) => process.stderr.write(line));
    this.now = now ?? (() => new Date());
  }

  /**
   * Writes one event when its level reaches the threshold.
   * @param level - Severity.
   * @param event - Event name.
   * @param fields - Structured fields (no user content).
   * @returns Nothing.
   */
  log(level: LogLevel, event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    if (ORDER[level] < ORDER[this.threshold]) {
      return;
    }
    this.write(`${JSON.stringify({ ts: this.now().toISOString(), level, event, ...fields })}\n`);
  }
}
