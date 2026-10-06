import { describe, expect, it } from '@jest/globals';
import { join, resolve } from 'node:path';
import { aggregateActivity } from '../../../../src/core/index/activity-aggregator.ts';
import { activityFilesSince } from '../../../../src/core/index/activity-files.ts';
import { readActivity } from '../../../../src/core/index/activity-reader.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { norm } from '../../../support/fakes/path-map.ts';

const ROOT = resolve('/store');
const GOOD = norm(join(ROOT, 'activity', 'm-aaaaaaaa', '2026-10-01.jsonl'));
const LINE = `${JSON.stringify({ ts: '2026-10-01T10:00:00.000Z', action: 'recalled', entity_id: 'x' })}\n`;

describe('activityFilesSince', () => {
  it('[WL-43] lists the files of every machine from a day on', async () => {
    const fs = new MemoryFileSystem({ [GOOD]: LINE, [join(ROOT, 'activity', 'm-aaaaaaaa', '2026-09-01.jsonl')]: LINE, [join(ROOT, 'activity', 'm-bbbbbbbb', 'notes.txt')]: 'x' });
    expect((await activityFilesSince(fs, ROOT, '2026-10-01')).map(norm)).toEqual([GOOD]);
    expect((await activityFilesSince(fs, ROOT, '')).length).toBe(2);
  });

  it('[WL-43] a file standing where the activity folder or a machine folder belongs gives no files instead of failing the build', async () => {
    const asFile = new MemoryFileSystem({ [join(ROOT, 'activity')]: 'not a directory' });
    expect(await activityFilesSince(asFile, ROOT, '')).toEqual([]);
    const machineAsFile = new MemoryFileSystem({ [GOOD]: LINE, [join(ROOT, 'activity', 'm-bbbbbbbb')]: 'not a directory' });
    expect((await activityFilesSince(machineAsFile, ROOT, '')).map(norm)).toEqual([GOOD]);
    expect((await aggregateActivity(asFile, [ROOT], new Date('2026-10-03T00:00:00Z'))).unreadableFiles).toBe(0);
    expect((await readActivity(asFile, [ROOT])).records).toEqual([]);
  });

  it('[WL-49] never follows a symbolic link standing for the activity folder or a machine folder', async () => {
    const outside = resolve('/outside');
    const fs = new MemoryFileSystem({ [join(outside, '2026-10-01.jsonl')]: LINE, [join(outside, 'm-cccccccc', '2026-10-01.jsonl')]: LINE, [GOOD]: LINE });
    fs.links.set(norm(join(ROOT, 'activity', 'm-linked')), norm(outside));
    expect((await activityFilesSince(fs, ROOT, '')).map(norm)).toEqual([GOOD]);
    const linkedRoot = new MemoryFileSystem({ [join(outside, 'm-cccccccc', '2026-10-01.jsonl')]: LINE });
    linkedRoot.links.set(norm(join(ROOT, 'activity')), norm(outside));
    expect(await activityFilesSince(linkedRoot, ROOT, '')).toEqual([]);
  });

  it('[WL-43] a folder that cannot be listed gives no files', async () => {
    const fs = new MemoryFileSystem({ [GOOD]: LINE });
    const readDir = fs.readDir.bind(fs);
    fs.readDir = async (path, options) => (path.endsWith('m-aaaaaaaa') ? Promise.reject(new Error('EACCES')) : readDir(path, options));
    expect(await activityFilesSince(fs, ROOT, '')).toEqual([]);
  });
});
