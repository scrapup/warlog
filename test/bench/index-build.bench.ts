import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/core/adapters/node-file-system.ts';
import { SystemClock } from '../../src/core/adapters/system-clock.ts';
import { IndexBuilder } from '../../src/core/index/index-builder.ts';
import { generateStore } from '../support/store-generator.ts';
import type { GeneratedStore } from '../support/store-generator.ts';

/** Spec SLA: indexing ≤ 5 s for 10 000 files. */
const SLA_MS = 5_000;
/** Number of entity files generated for the benchmark. */
const FILES = 10_000;

let base = '';
let store: GeneratedStore | undefined;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'warlog-bench-'));
  store = generateStore(base, FILES);
}, 120_000);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('index build benchmark', () => {
  it(`[SLA] indexes ${FILES} files within ${SLA_MS} ms`, async () => {
    if (store === undefined) {
      throw new Error('store not generated');
    }
    const builder = new IndexBuilder({ fs: new NodeFileSystem(), clock: new SystemClock() });
    const { stats, index } = await builder.build({ global: store.globalRoot, repository: { root: store.repoRoot, key: 'bench', mode: 'in-repo', mainWorktree: join(store.repoRoot, '..') }, warnings: [] });
    process.stdout.write(`index-build: ${stats.files} files in ${stats.durationMs} ms (${index.size} entities)\n`);
    expect(index.size).toBe(FILES);
    expect(stats.invalid).toBe(0);
    expect(stats.durationMs).toBeLessThanOrEqual(SLA_MS);
  }, 60_000);
});
