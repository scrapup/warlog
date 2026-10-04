import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { aggregateActivity } from '../../../../src/core/index/activity-aggregator.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { GLOBAL_ROOT, REPO_ROOT } from '../../../support/store-fixture.ts';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const MEM = '01J00000000000000000000M01';
const CMD = '01J00000000000000000000C01';

/**
 * JSONL of records.
 * @param records - Records.
 * @returns File content.
 */
function jsonl(...records: Record<string, unknown>[]): string {
  return records.map((r) => `${JSON.stringify(r)}\n`).join('');
}

describe('aggregateActivity', () => {
  it('[WL-18] aggregates recall usage and command observations of the last 90 days from both roots', async () => {
    const fs = new MemoryFileSystem({
      [join(GLOBAL_ROOT, 'activity', 'm-aaaaaaaa', '2026-10-01.jsonl')]: jsonl(
        { ts: '2026-10-01T10:00:00.000Z', action: 'recalled', entity_id: MEM },
        { ts: '2026-10-01T09:00:00.000Z', action: 'recalled', entity_id: MEM },
      ),
      [join(REPO_ROOT, 'activity', 'm-bbbbbbbb', '2026-10-02.jsonl')]: `${jsonl(
        { ts: '2026-10-02T08:00:00.000Z', machine: 'm-bbbbbbbb', action: 'command_observed', cmd_memory_id: CMD, outcome: 'fail', exit_code: 2, env: { os: 'linux' } },
        { ts: '2026-10-02T07:00:00.000Z', action: 'command_observed', cmd_memory_id: CMD, outcome: 'ok' },
        { ts: '2026-10-02T07:30:00.000Z', action: 'created', entity_id: MEM },
      )}not json\n[1]\n\n`,
      [join(REPO_ROOT, 'activity', 'm-bbbbbbbb', '2026-06-01.jsonl')]: jsonl({ ts: '2026-06-01T00:00:00.000Z', action: 'recalled', entity_id: MEM }),
      [join(REPO_ROOT, 'activity', 'm-bbbbbbbb', 'notes.txt')]: 'ignored',
    });
    const summary = await aggregateActivity(fs, [GLOBAL_ROOT, REPO_ROOT], NOW);
    expect(summary.usage.get(MEM)).toEqual({ count: 2, lastAt: '2026-10-01T10:00:00.000Z' });
    expect(summary.commands.get(CMD)).toEqual([
      { ts: '2026-10-02T07:00:00.000Z', machine: '', outcome: 'ok', exitCode: undefined, env: {} },
      { ts: '2026-10-02T08:00:00.000Z', machine: 'm-bbbbbbbb', outcome: 'fail', exitCode: 2, env: { os: 'linux' } },
    ]);
    expect(summary.invalidLines).toBe(2);
  });

  it('returns an empty summary without activity', async () => {
    const summary = await aggregateActivity(new MemoryFileSystem(), [GLOBAL_ROOT], NOW);
    expect(summary.usage.size + summary.commands.size + summary.invalidLines).toBe(0);
  });
});
