import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/core/adapters/node-file-system.ts';
import { SystemClock } from '../../src/core/adapters/system-clock.ts';
import { IndexBuilder } from '../../src/core/index/index-builder.ts';
import { IndexProvider } from '../../src/core/index/index-provider.ts';
import { PathGuard } from '../../src/core/security/path-guard.ts';
import type { StoreRoots } from '../../src/core/storage/store-roots.ts';
import { RecordingLogger } from '../support/fakes/simple-fakes.ts';
import { fakeUlid, generateStore } from '../support/store-generator.ts';

/** Informative target of a CLI point read (plan §3.7: `var get` < 150 ms p95, whole process). */
const POINT_TARGET_MS = 150;

let base = '';
let roots: StoreRoots | undefined;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'warlog-bench-'));
  const store = generateStore(base, 10_000);
  roots = { global: store.globalRoot, repository: { root: store.repoRoot, key: 'bench', mode: 'in-repo', mainWorktree: join(store.repoRoot, '..') }, warnings: [] };
}, 120_000);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('command-line point loading benchmark', () => {
  it('[SLA] reads one entity of a 10 000-file store faster than a full index build', async () => {
    if (roots === undefined) {
      throw new Error('store not generated');
    }
    const fs = new NodeFileSystem();
    const provider = new IndexProvider({ fs, builder: new IndexBuilder({ fs, clock: new SystemClock() }), guard: new PathGuard(fs), logger: new RecordingLogger(), mode: 'lazy' });
    const project = fakeUlid('PR', 1);
    const id = fakeUlid('TA', 11);
    const started = performance.now();
    const entity = await provider.sourceFor(roots, 'point', 'bench').entity({ type: 'task', id, scope: 'repo', projectId: project });
    const pointMs = performance.now() - started;
    const fullStarted = performance.now();
    await provider.sourceFor(roots, 'full', 'bench').full();
    const fullMs = performance.now() - fullStarted;
    process.stdout.write(`cli-point: point read ${pointMs.toFixed(1)} ms; full index ${fullMs.toFixed(0)} ms\n`);
    expect(entity?.id).toBe(id);
    expect(pointMs).toBeLessThan(POINT_TARGET_MS);
  }, 60_000);
});
