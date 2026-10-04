/**
 * Aggregates the activity of the last 90 days (plan §3.7): recall usage per entity and command
 * observations per command memory (WL-18). Unreadable lines are counted, never thrown.
 */
import type { FileSystem } from '../ports/file-system.port.ts';
import { compareCodeUnits } from '../security/compare.ts';
import { isPlainRecord } from '../security/plain-record.ts';
import { mapLimit } from './bounded.ts';

/** Days of activity read at start. */
export const ACTIVITY_WINDOW_DAYS = 90;

/** Recall usage of one entity. */
export interface UsageStats {
  /** Number of `recalled` records. */
  readonly count: number;
  /** Most recent record (ISO 8601). */
  readonly lastAt: string;
}

/** One `command_observed` record. */
export interface CommandObservation {
  /** When (ISO 8601). */
  readonly ts: string;
  /** Machine that observed it. */
  readonly machine: string;
  /** `ok` or `fail`. */
  readonly outcome: string;
  /** Exit code, when recorded. */
  readonly exitCode: number | undefined;
  /** Environment (`os`, `node`). */
  readonly env: Readonly<Record<string, unknown>>;
}

/** Activity read from the store. */
export interface ActivitySummary {
  /** Recall usage by entity id. */
  readonly usage: ReadonlyMap<string, UsageStats>;
  /** Observations by command memory id, oldest first. */
  readonly commands: ReadonlyMap<string, readonly CommandObservation[]>;
  /** Lines that could not be read. */
  readonly invalidLines: number;
}

/** Summary without activity. */
export const EMPTY_ACTIVITY: ActivitySummary = { usage: new Map(), commands: new Map(), invalidLines: 0 };

/** Mutable state while aggregating. */
interface Accumulator {
  /** Usage by entity. */
  readonly usage: Map<string, UsageStats>;
  /** Observations by command. */
  readonly commands: Map<string, CommandObservation[]>;
  /** Unreadable lines. */
  invalidLines: number;
}

/**
 * Parses one JSONL line.
 * @param line - Line.
 * @returns The record, or `undefined` when unreadable.
 */
function parseLine(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return isPlainRecord(value) && typeof value['ts'] === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Counts a `recalled` record.
 * @param acc - Accumulator.
 * @param entityId - Recalled entity.
 * @param ts - Record time.
 */
function recordUsage(acc: Accumulator, entityId: string, ts: string): void {
  const previous = acc.usage.get(entityId);
  const lastAt = previous !== undefined && previous.lastAt > ts ? previous.lastAt : ts;
  acc.usage.set(entityId, { count: (previous?.count ?? 0) + 1, lastAt });
}

/**
 * Reads a `command_observed` record.
 * @param record - Activity record.
 * @returns The observation.
 */
function toObservation(record: Record<string, unknown>): CommandObservation {
  const exit = record['exit_code'];
  const env = record['env'];
  return {
    ts: String(record['ts']),
    machine: String(record['machine'] ?? ''),
    outcome: String(record['outcome'] ?? ''),
    exitCode: typeof exit === 'number' ? exit : undefined,
    env: isPlainRecord(env) ? env : {},
  };
}

/**
 * Adds one record to the accumulator.
 * @param acc - Accumulator.
 * @param record - Activity record.
 */
function accumulate(acc: Accumulator, record: Record<string, unknown>): void {
  const entityId = record['entity_id'];
  if (record['action'] === 'recalled' && typeof entityId === 'string') {
    recordUsage(acc, entityId, String(record['ts']));
  }
  const cmd = record['cmd_memory_id'];
  if (record['action'] === 'command_observed' && typeof cmd === 'string') {
    acc.commands.set(cmd, [...(acc.commands.get(cmd) ?? []), toObservation(record)]);
  }
}

/**
 * Lists the activity files of a root within the window.
 * @param fs - File system.
 * @param root - Store root.
 * @param since - First day kept (`yyyy-mm-dd`).
 * @returns Absolute file paths.
 */
async function activityFiles(fs: FileSystem, root: string, since: string): Promise<string[]> {
  const dir = `${root}/activity`;
  const machines = await fs.readDir(dir);
  const perMachine = await Promise.all(
    machines.map(async (machine) => (await fs.readDir(`${dir}/${machine}`)).filter((f) => f.endsWith('.jsonl') && f.slice(0, 10) >= since).map((f) => `${dir}/${machine}/${f}`)),
  );
  return perMachine.flat();
}

/**
 * Reads the activity of the given roots.
 * @param fs - File system.
 * @param roots - Store roots holding `activity/`.
 * @param now - Current time.
 * @returns The summary.
 */
export async function aggregateActivity(fs: FileSystem, roots: readonly string[], now: Date): Promise<ActivitySummary> {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const files = (await Promise.all(roots.map((root) => activityFiles(fs, root, since)))).flat();
  const acc: Accumulator = { usage: new Map(), commands: new Map(), invalidLines: 0 };
  const texts = await mapLimit(files, 16, (file) => fs.readFile(file).catch(() => ''));
  for (const line of texts.flatMap((text) => text.split('\n'))) {
    if (line.trim() === '') {
      continue;
    }
    const record = parseLine(line);
    if (record === undefined) {
      acc.invalidLines += 1;
    } else {
      accumulate(acc, record);
    }
  }
  acc.commands.forEach((list) => list.sort((a, b) => compareCodeUnits(a.ts, b.ts)));
  return acc;
}
