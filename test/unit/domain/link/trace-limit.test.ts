import { describe, expect, it } from '@jest/globals';
import { IndexBuilder } from '../../../../src/core/index/index-builder.ts';
import { MAX_TRACE_NODES, walkTrace } from '../../../../src/domain/link/trace-walker.ts';
import { stringifyFrontMatter } from '../../../../src/core/storage/front-matter-codec.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { FixedClock } from '../../../support/fakes/simple-fakes.ts';
import { GLOBAL_ROOT, REPO_ROOT } from '../../../support/store-fixture.ts';
import { join } from 'node:path';

describe('trace node limit', () => {
  it('[WL-22] stops at 2 000 nodes and reports the walk as truncated', async () => {
    const hub = '01J000000000000000000000H1';
    const links = Array.from({ length: MAX_TRACE_NODES + 50 }, (_, i) => ({ rel: 'relates', target: `git:${i.toString(16).padStart(7, '0')}` }));
    const fs = new MemoryFileSystem({
      [join(GLOBAL_ROOT, 'global', 'memories', `${hub}.md`)]: stringifyFrontMatter({ data: { id: hub, type: 'memory', rev: 1, created_at: 'x', updated_at: 'x', machine: 'm', links }, body: '' }),
    });
    const { index } = await new IndexBuilder({ fs, clock: new FixedClock() }).build({ global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo', mainWorktree: REPO_ROOT }, warnings: [] });
    const walked = walkTrace(index, hub, 3);
    expect(walked.truncated).toBe(true);
    expect(walked.rows).toHaveLength(MAX_TRACE_NODES - 1);
  });
});
