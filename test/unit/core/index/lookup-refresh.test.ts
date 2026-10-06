import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { readActivity } from '../../../../src/core/index/activity-reader.ts';
import { IndexBuilder } from '../../../../src/core/index/index-builder.ts';
import { LiveIndexSource, pointOnly } from '../../../../src/core/index/index-source.ts';
import { LazyIndexSource } from '../../../../src/core/index/lazy-index-source.ts';
import { stringifyFrontMatter } from '../../../../src/core/storage/front-matter-codec.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { FixedClock } from '../../../support/fakes/simple-fakes.ts';
import { GLOBAL_ROOT, REPO_ROOT, memoryStore } from '../../../support/store-fixture.ts';

const P = '01J000000000000000000000P1';
const T = '01J000000000000000000000T1';

/**
 * An entity file.
 * @param id - Id.
 * @param type - Type.
 * @param extra - Extra fields.
 * @returns Content.
 */
function entity(id: string, type: string, extra: Record<string, unknown> = {}): string {
  return stringifyFrontMatter({ data: { id, type, rev: 1, created_at: 'x', updated_at: 'x', machine: 'm', ...extra }, body: '' });
}

/**
 * A lazy source over a store.
 * @param withRepository - Whether the repository root exists.
 * @returns Store and source.
 */
function lazy(withRepository = true): { store: ReturnType<typeof memoryStore>; source: LazyIndexSource } {
  const store = memoryStore({ withRepository });
  const source = new LazyIndexSource({ fs: store.fs, builder: new IndexBuilder({ fs: store.fs, clock: store.clock }), paths: store.paths, roots: store.roots });
  return { store, source };
}

describe('index source lookup and refresh', () => {
  it('finds project-scoped entities by id without scanning the store', async () => {
    const { store, source } = lazy();
    store.fs.files.set(join(REPO_ROOT, 'projects', P, 'project.md'), entity(P, 'project'));
    store.fs.files.set(join(REPO_ROOT, 'projects', P, 'tasks', `${T}.md`), entity(T, 'task', { project_id: P }));
    store.fs.files.set(join(REPO_ROOT, 'projects', 'not-an-id', 'x.md'), 'ignored');
    expect((await source.lookup('task', T))?.projectId).toBe(P);
    expect((await source.lookup('project', P))?.id).toBe(P);
    expect(await source.lookup('epic', T)).toBeUndefined();
    expect(await source.lookup('template', T)).toBeUndefined();
    expect(await source.lookup('comment', T)).toBeUndefined();
  });

  it('uses the full index once built and applies refreshed files to it', async () => {
    const { store, source } = lazy();
    await source.refresh(join(REPO_ROOT, 'nothing.md'));
    const view = await source.full();
    const path = join(REPO_ROOT, 'projects', P, 'project.md');
    store.fs.files.set(path, entity(P, 'project'));
    expect(await source.lookup('project', P)).toBeUndefined();
    await source.refresh(path);
    expect((await source.lookup('project', P))?.id).toBe(P);
    expect(view.ofType('project').map((p) => p.id)).toEqual([P]);
  });

  it('finds nothing repository-scoped without a repository', async () => {
    const { source } = lazy(false);
    expect(await source.lookup('task', T)).toBeUndefined();
    expect(await source.lookup('project', P)).toBeUndefined();
  });

  it('a fixed view looks entities up and ignores refreshes; point sources delegate both', async () => {
    const fs = new MemoryFileSystem({ [join(GLOBAL_ROOT, 'templates', `${T}.md`)]: entity(T, 'template') });
    const { index } = await new IndexBuilder({ fs, clock: new FixedClock() }).build({ global: GLOBAL_ROOT, warnings: [] });
    const fixed = new LiveIndexSource(index);
    await fixed.refresh();
    expect((await fixed.lookup('template', T))?.id).toBe(T);
    const point = pointOnly(fixed, 'op');
    expect((await point.lookup('template', T))?.id).toBe(T);
    await expect(point.refresh('x')).resolves.toBeUndefined();
  });
});

describe('activity reader', () => {
  it('merges machines in time order, filters by instant and counts unreadable lines', async () => {
    const fs = new MemoryFileSystem({
      [join(REPO_ROOT, 'activity', 'm-a', '2026-10-01.jsonl')]: '{"ts":"2026-10-01T10:00:00.000Z","n":2}\nnot json\n[1]\n',
      [join(REPO_ROOT, 'activity', 'm-b', '2026-10-01.jsonl')]: '{"ts":"2026-10-01T09:00:00.000Z","n":1}\n',
      [join(REPO_ROOT, 'activity', 'm-b', '2026-09-30.jsonl')]: '{"ts":"2026-09-30T09:00:00.000Z","n":0}\n',
      [join(REPO_ROOT, 'activity', 'm-b', 'notes.txt')]: 'skipped',
    });
    const all = await readActivity(fs, [REPO_ROOT]);
    expect(all.records.map((r) => r['n'])).toEqual([0, 1, 2]);
    expect(all.invalidLines).toBe(2);
    expect((await readActivity(fs, [REPO_ROOT, GLOBAL_ROOT], '2026-10-01T09:30:00.000Z')).records.map((r) => r['n'])).toEqual([2]);
  });
});
