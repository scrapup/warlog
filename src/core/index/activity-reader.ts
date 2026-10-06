/**
 * Reads raw activity records (plan §3.6) of the store roots for the activity queries:
 * `<root>/activity/<machine>/<yyyy-mm-dd>.jsonl`, every machine merged and ordered by time.
 * Unreadable files and lines are skipped and counted, never thrown.
 */
import type { FileSystem } from '../ports/file-system.port.ts';
import { compareCodeUnits } from '../security/compare.ts';
import { isPlainRecord } from '../security/plain-record.ts';
import { MAX_OPEN_FILES, mapLimit } from './bounded.ts';
import { readRegularFile } from './file-loader.ts';

/** One activity record. */
export type ActivityRecord = Readonly<Record<string, unknown>>;

/** Records read and what could not be read. */
export interface ActivityRead {
  /** Records ordered by `ts` (oldest first). */
  readonly records: ActivityRecord[];
  /** Lines that could not be parsed. */
  readonly invalidLines: number;
  /** Files that could not be read. */
  readonly unreadableFiles: number;
}

/** Records of one file. */
interface ParsedFile {
  /** Readable records. */
  readonly records: ActivityRecord[];
  /** Unreadable lines. */
  readonly invalid: number;
}

/**
 * Lists the activity files of a root from a day on.
 * @param fs - File system.
 * @param root - Store root.
 * @param sinceDay - First day kept (`yyyy-mm-dd`, `''` = all).
 * @returns Absolute file paths.
 */
async function dayFiles(fs: FileSystem, root: string, sinceDay: string): Promise<string[]> {
  const dir = `${root}/activity`;
  const machines = await fs.readDir(dir);
  const perMachine = await Promise.all(
    machines.map(async (machine) => (await fs.readDir(`${dir}/${machine}`)).filter((f) => f.endsWith('.jsonl') && f.slice(0, 10) >= sinceDay).map((f) => `${dir}/${machine}/${f}`)),
  );
  return perMachine.flat();
}

/**
 * Parses the lines of one file.
 * @param text - File content.
 * @returns Records and the number of unreadable lines.
 */
function parseLines(text: string): ParsedFile {
  const records: ActivityRecord[] = [];
  let invalid = 0;
  for (const line of text.split('\n').filter((l) => l.trim() !== '')) {
    try {
      const value: unknown = JSON.parse(line);
      if (isPlainRecord(value) && typeof value['ts'] === 'string') {
        records.push(value);
      } else {
        invalid += 1;
      }
    } catch {
      invalid += 1;
    }
  }
  return { records, invalid };
}

/**
 * Reads the activity of some roots.
 * @param fs - File system.
 * @param roots - Store roots holding `activity/`.
 * @param since - Keep records at or after this ISO 8601 instant (`undefined` = all).
 * @returns The records, oldest first.
 */
export async function readActivity(fs: FileSystem, roots: readonly string[], since?: string): Promise<ActivityRead> {
  const sinceDay = since === undefined ? '' : since.slice(0, 10);
  const files = (await Promise.all(roots.map((root) => dayFiles(fs, root, sinceDay)))).flat();
  const reads = await mapLimit(files, MAX_OPEN_FILES, (file) => readRegularFile(fs, file));
  const parsed = reads.filter((r) => 'text' in r).map((r) => parseLines(r.text));
  const records = parsed
    .flatMap((p) => p.records)
    .filter((r) => since === undefined || String(r['ts']) >= since)
    .sort((a, b) => compareCodeUnits(String(a['ts']), String(b['ts'])));
  return { records, invalidLines: parsed.reduce((n, p) => n + p.invalid, 0), unreadableFiles: reads.length - parsed.length };
}
