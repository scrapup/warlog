/** Log severity. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured logger port. Never receives user content (plan §5.3). */
export interface Logger {
  /**
   * Writes one structured log event.
   * @param level - Severity.
   * @param event - Event name, e.g. `index.built`.
   * @param fields - Counts, codes and names only.
   * @returns Nothing.
   */
  log(level: LogLevel, event: string, fields?: Readonly<Record<string, unknown>>): void;
}
