/**
 * Aggregates the activity of the last 90 days (plan §3.7): recall usage per entity and command
 * observations per command memory (WL-18). Files are processed one at a time as they are read
 * (no global buffer); unreadable files and lines are counted, never thrown.
 */
import type { FileSystem } from '../ports/file-system.port.ts';
import type { ActivitySummary, CommandObservation, UsageStats } from '../ports/store-view.port.ts';
import { compareCodeUnits } from '../security/compare.ts';
import { isPlainRecord } from '../security/plain-record.ts';
import { MAX_OPEN_FILES, mapLimit } from './bounded.ts';
import { readRegularFile } from './file-loader.ts';

export type { ActivitySummary, CommandObservation, UsageStats } from '../ports/store-view.port.ts';

/** Days of activity read at start. */
export const ACTIVITY_WINDOW_DAYS = 90;

/** Milliseconds in a day. */
const MS_PER_DAY = 86_400_000;

/** Summary without activity. */
export const EMPTY_ACTIVITY: ActivitySummary = { usage: new Map(), commands: new Map(), invalidLines: 0, unreadableFiles: 0 };

/** Mutable state while aggregating. */
interface Accumulator {
  /** Usage by entity. */
  readonly usage: Map<string, UsageStats>;
  /** Observations by command. */
  readonly commands: Map<string, CommandObservation[]>;
  /** Unreadable lines. */
  invalidLines: number;
  /** Unreadable files. */
  unreadableFiles: number;
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
    const list = acc.commands.get(cmd);
    if (list === undefined) {
      acc.commands.set(cmd, [toObservation(record)]);
    } else {
      list.push(toObservation(record));
    }
  }
}

/**
 * Adds every line of one file.
 * @param acc - Accumulator.
 * @param text - File content.
 */
function accumulateText(acc: Accumulator, text: string): void {
  for (const line of text.split('\n')) {
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
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * MS_PER_DAY).toISOString().slice(0, 10);
  const files = (await Promise.all(roots.map((root) => activityFiles(fs, root, since)))).flat();
  const acc: Accumulator = { usage: new Map(), commands: new Map(), invalidLines: 0, unreadableFiles: 0 };
  await mapLimit(files, MAX_OPEN_FILES, async (file) => {
    const read = await readRegularFile(fs, file);
    if ('text' in read) {
      accumulateText(acc, read.text);
    } else {
      acc.unreadableFiles += 1;
    }
  });
  acc.commands.forEach((list) => list.sort((a, b) => compareCodeUnits(a.ts, b.ts)));
  return acc;
}
