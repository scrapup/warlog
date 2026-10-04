/**
 * Small fakes for the clock, id, environment, logger and machine-id ports.
 */
import type { Clock } from '../../../src/core/ports/clock.port.ts';
import type { Env } from '../../../src/core/ports/env.port.ts';
import type { IdGenerator } from '../../../src/core/ports/id-generator.port.ts';
import type { LogLevel, Logger } from '../../../src/core/ports/logger.port.ts';
import type { MachineIdProvider } from '../../../src/core/ports/machine-id.port.ts';

/** Clock returning a settable instant. */
export class FixedClock implements Clock {
  /** Current instant. */
  current: Date;

  /**
   * Creates the clock.
   * @param iso - Initial instant (ISO 8601).
   */
  constructor(iso = '2026-10-03T12:00:00.000Z') {
    this.current = new Date(iso);
  }

  /**
   * Returns the current instant.
   * @returns A copy of the current date.
   */
  now(): Date {
    return new Date(this.current.getTime());
  }

  /**
   * Moves the clock.
   * @param ms - Milliseconds to add (negative moves backwards).
   * @returns Nothing.
   */
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Generates `01J0000000000000000000000N` style sequential ULIDs. */
export class SequentialIds implements IdGenerator {
  /** Last number issued. */
  private n = 0;

  /**
   * Returns the next id.
   * @returns A valid 26-character ULID.
   */
  next(): string {
    this.n += 1;
    return `01J${String(this.n).padStart(23, '0')}`;
  }
}

/** Environment backed by a plain record. */
export class MemoryEnv implements Env {
  /** Variables. */
  readonly vars: Record<string, string>;
  /** Home directory. */
  readonly home: string;
  /** Working directory. */
  workDir: string;

  /**
   * Creates the environment.
   * @param vars - Variables.
   * @param home - Home directory.
   * @param workDir - Working directory.
   */
  constructor(vars: Record<string, string> = {}, home = '/home/u', workDir = '/work') {
    this.vars = vars;
    this.home = home;
    this.workDir = workDir;
  }

  /**
   * Reads a variable.
   * @param name - Name.
   * @returns Value or `undefined`.
   */
  get(name: string): string | undefined {
    const value = this.vars[name];
    return value === undefined || value === '' ? undefined : value;
  }

  /**
   * Returns the home directory.
   * @returns Path.
   */
  homeDir(): string {
    return this.home;
  }

  /**
   * Returns the host name.
   * @returns Host name.
   */
  hostName(): string {
    return 'test-host';
  }

  /**
   * Returns the working directory.
   * @returns Path.
   */
  cwd(): string {
    return this.workDir;
  }
}

/** Logger recording every event. */
export class RecordingLogger implements Logger {
  /** Recorded events. */
  readonly events: Array<{ level: LogLevel; event: string; fields: Readonly<Record<string, unknown>> }> = [];

  /**
   * Records an event.
   * @param level - Severity.
   * @param event - Name.
   * @param fields - Fields.
   * @returns Nothing.
   */
  log(level: LogLevel, event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.events.push({ level, event, fields });
  }
}

/** Machine id fixed at construction. */
export class FixedMachineId implements MachineIdProvider {
  /** The id. */
  readonly id: string;

  /**
   * Creates the provider.
   * @param id - The id.
   */
  constructor(id = 'test-host-abc123') {
    this.id = id;
  }

  /**
   * Returns the id.
   * @returns The id.
   */
  async get(): Promise<string> {
    return this.id;
  }
}
