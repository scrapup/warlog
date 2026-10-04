import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { IndexBuilder } from '../../../../src/core/index/index-builder.ts';
import { mapLimit } from '../../../../src/core/index/bounded.ts';
import { stringifyFrontMatter } from '../../../../src/core/storage/front-matter-codec.ts';
import type { StoreRoots } from '../../../../src/core/storage/store-roots.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { FixedClock } from '../../../support/fakes/simple-fakes.ts';
import { GLOBAL_ROOT, REPO_ROOT } from '../../../support/store-fixture.ts';

const P = '01J00000000000000000000P01';
const E = '01J00000000000000000000E01';
const T1 = '01J00000000000000000000T01';
const T2 = '01J00000000000000000000T02';
const MISSING = '01J00000000000000000000X99';
const M = '01J00000000000000000000M01';

const ROOTS: StoreRoots = { global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo', mainWorktree: join(REPO_ROOT, '..') }, warnings: [] };

/**
 * Renders an entity file.
 * @param data - Front matter (managed fields defaulted).
 * @param body - Body.
 * @returns File content.
 */
function entity(data: Record<string, unknown>, body = ''): string {
  return stringifyFrontMatter({ data: { rev: 1, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', machine: 'm-aaaaaaaa', ...data }, body });
}

/**
 * Path under the repository root.
 * @param parts - Segments.
 * @returns Absolute path.
 */
function repo(...parts: string[]): string {
  return join(REPO_ROOT, ...parts);
}

/**
 * A store with one project, an epic, two tasks and a memory.
 * @returns The file system.
 */
function store(): MemoryFileSystem {
  return new MemoryFileSystem({
    [repo('projects', P, 'project.md')]: entity({ id: P, type: 'project', name: 'warlog', status: 'active' }),
    [repo('projects', P, 'epics', `${E}.md`)]: entity({ id: E, type: 'epic', project_id: P, name: 'Core', external: [{ system: 'clickup', key: 'CU-1' }] }),
    [repo('projects', P, 'tasks', `${T1}.md`)]: entity({ id: T1, type: 'task', project_id: P, epic_id: E, title: 'A', depends_on: [T2, MISSING] }, 'Body A\n'),
    [repo('projects', P, 'tasks', `${T2}.md`)]: entity({ id: T2, type: 'task', project_id: P, epic_id: E, title: 'B', links: [{ rel: 'implements', target: 'spec:docs/x.md#a' }, { rel: 'relates', target: T1 }] }),
    [join(GLOBAL_ROOT, 'global', 'memories', `${M}.md`)]: entity({ id: M, type: 'memory', scope: 'global', kind: 'fact', title: 'F', status: 'active', deleted_at: '2026-10-02T00:00:00.000Z' }),
    [repo('vars', 'ci.timeout.yaml')]: 'name: ci.timeout\ntype: integer\nvalue: 30\n',
    [repo('projects', P, 'vars', 'owner.yaml')]: 'name: owner\ntype: string\nvalue: me\n',
  });
}

/**
 * Builds the view of a file system.
 * @param fs - File system.
 * @param roots - Roots.
 * @returns Build result.
 */
async function build(fs: MemoryFileSystem, roots: StoreRoots = ROOTS) {
  return new IndexBuilder({ fs, clock: new FixedClock() }).build(roots);
}

describe('IndexBuilder', () => {
  it('[WL-06] builds the whole view from the files of both roots without writing anything', async () => {
    const fs = store();
    const before = new Map(fs.files);
    const { index, stats } = await build(fs);
    expect(index.get(T1)).toMatchObject({ type: 'task', scope: 'repo', projectId: P, record: { body: 'Body A\n' } });
    expect(index.get(M)).toMatchObject({ scope: 'global', projectId: undefined, deleted: true });
    expect(index.list('task', P).map((e) => e.id)).toEqual([T1, T2]);
    expect(index.childrenOf(E).map((e) => e.id)).toEqual([T1, T2]);
    expect(index.childrenOf(P).map((e) => e.id)).toEqual([E, T1, T2]);
    expect(index.backlinksOf(T1).map((e) => e.id)).toEqual([T2]);
    expect(index.byExternal('clickup', 'CU-1')?.id).toBe(E);
    expect(index.byExternal('clickup', 'none')).toBeUndefined();
    expect(index.listVars((v) => v.projectId === P).map((v) => v.name)).toEqual(['owner']);
    expect(index.listVars((v) => v.projectId === undefined)).toMatchObject([{ name: 'ci.timeout', scope: 'repo' }]);
    expect(stats).toMatchObject({ files: 7, entries: 7, invalid: 0, conflictCopies: 0 });
    expect(fs.files).toEqual(before);
  });

  it('[WL-06] rebuilds the same view from the files on every start', async () => {
    const fs = store();
    const first = await build(fs);
    const second = await build(fs);
    expect(second.index.list('task', P)).toEqual(first.index.list('task', P));
  });

  it('[WL-44] keeps links and dependencies to absent entities as pending', async () => {
    const { index } = await build(store());
    expect(index.pendingLinks()).toEqual([{ from: T1, rel: 'depends_on', target: MISSING }]);
  });

  it('[WL-43] excludes and reports conflict copies, merge-conflicted, invalid, mismatched and duplicate files', async () => {
    const fs = store();
    fs.files.set(repo('projects', P, 'tasks', `${T1} (conflicted copy 2026-10-01).md`), entity({ id: T1, type: 'task' }));
    fs.files.set(repo('projects', P, 'tasks', `${T2}.sync-conflict-20261001-1.md`), entity({ id: T2, type: 'task' }));
    fs.files.set(repo('projects', P, 'notes', '01J00000000000000000000N01.md'), '---\nid: x\n<<<<<<< HEAD\n=======\n>>>>>>> other\n---\n');
    fs.files.set(repo('projects', P, 'notes', '01J00000000000000000000N02.md'), 'no front matter');
    fs.files.set(repo('projects', P, 'notes', '01J00000000000000000000N03.md'), entity({ id: '01J00000000000000000000N99', type: 'note' }));
    fs.files.set(repo('projects', P, 'notes', '01J00000000000000000000N04.md'), entity({ id: '01J00000000000000000000N04', type: 'unknown' }));
    fs.files.set(repo('memories', `${M}.md`), entity({ id: M, type: 'memory' }));
    fs.files.set(repo('vars', 'bad.yaml'), 'name: [\n');
    fs.files.set(repo('vars', 'fields.yaml'), 'value: 1\n');
    fs.files.set(repo('projects', P, 'other.yaml'), 'a: 1\n');
    const { index, stats } = await build(fs);
    expect(index.excluded.conflictCopies().map((c) => c.relative)).toEqual([
      `projects/${P}/tasks/${T1} (conflicted copy 2026-10-01).md`,
      `projects/${P}/tasks/${T2}.sync-conflict-20261001-1.md`,
    ]);
    expect(index.excluded.invalidFiles().map((p) => [p.relative, p.reason])).toEqual([
      [`memories/${M}.md`, 'duplicate_id'],
      [`projects/${P}/notes/01J00000000000000000000N01.md`, 'merge_conflict'],
      [`projects/${P}/notes/01J00000000000000000000N02.md`, 'front_matter'],
      [`projects/${P}/notes/01J00000000000000000000N03.md`, 'id_mismatch'],
      [`projects/${P}/notes/01J00000000000000000000N04.md`, 'front_matter'],
      [`projects/${P}/other.yaml`, 'unexpected_file'],
      ['vars/bad.yaml', 'yaml'],
      ['vars/fields.yaml', 'var_fields'],
    ]);
    expect(index.get(M)?.scope).toBe('global');
    expect(stats).toMatchObject({ invalid: 8, conflictCopies: 2 });
  });

  it('[WL-43] skips activity logs, document areas and other repositories, and records temp files', async () => {
    const fs = store();
    fs.files.set(repo('activity', 'm-aaaaaaaa', '2026-10-01.jsonl'), '{}\n');
    fs.files.set(repo('docs', 'epic', 'opp', 'spec.md'), '# Spec\n');
    fs.files.set(join(GLOBAL_ROOT, 'repos', 'other', 'memories', `${M}.md`), entity({ id: M, type: 'memory' }));
    fs.files.set(repo('projects', P, 'tasks', `.${T1}.md.tmp-1-abc`), 'partial');
    fs.mtimes.set(repo('projects', P, 'tasks', `.${T1}.md.tmp-1-abc`), 1_000);
    fs.files.set(repo('README.txt'), 'hi');
    const { index } = await build(fs);
    expect(index.excluded.invalidFiles()).toEqual([]);
    expect(index.excluded.tempFiles()).toEqual([{ root: 'repo', relative: `projects/${P}/tasks/.${T1}.md.tmp-1-abc`, path: repo('projects', P, 'tasks', `.${T1}.md.tmp-1-abc`), mtimeMs: 1_000 }]);
  });

  it('reports unreadable files as invalid', async () => {
    const fs = store();
    const path = repo('projects', P, 'tasks', `${T1}.md`);
    fs.failReads = new Set([path]);
    const { index } = await build(fs);
    expect(index.excluded.invalidFiles()).toMatchObject([{ path, reason: 'unreadable' }]);
  });

  it('builds the global view alone outside a repository', async () => {
    const { index } = await build(store(), { global: GLOBAL_ROOT, warnings: [] });
    expect(index.size).toBe(1);
  });
});

describe('IndexBuilder.reload', () => {
  it('[WL-06] applies added, changed, broken and deleted files', async () => {
    const fs = store();
    const builder = new IndexBuilder({ fs, clock: new FixedClock() });
    const { index } = await builder.build(ROOTS);
    const path = repo('projects', P, 'tasks', `${T1}.md`);
    fs.files.set(path, entity({ id: T1, type: 'task', project_id: P, title: 'A2' }));
    await builder.reload(index, ROOTS, path);
    expect(index.get(T1)?.record.data['title']).toBe('A2');
    expect(index.pendingLinks()).toEqual([]);
    expect(index.childrenOf(E).map((e) => e.id)).toEqual([T2]);
    fs.files.set(path, 'broken');
    await builder.reload(index, ROOTS, path);
    expect(index.get(T1)).toBeUndefined();
    expect(index.excluded.invalidFiles().map((p) => p.path)).toEqual([path]);
    fs.files.delete(path);
    await builder.reload(index, ROOTS, path);
    expect(index.excluded.invalidFiles()).toEqual([]);
  });

  it('[WL-06] forgets every file of a deleted directory', async () => {
    const fs = store();
    const builder = new IndexBuilder({ fs, clock: new FixedClock() });
    const { index } = await builder.build(ROOTS);
    for (const key of [...fs.files.keys()].filter((k) => k.startsWith(repo('projects', P)))) {
      fs.files.delete(key);
    }
    await builder.reload(index, ROOTS, repo('projects', P));
    expect(index.list('task', P)).toEqual([]);
    expect(index.size).toBe(1);
  });

  it('ignores paths outside the roots, directories and skipped areas', async () => {
    const fs = store();
    const builder = new IndexBuilder({ fs, clock: new FixedClock() });
    const { index } = await builder.build(ROOTS);
    await builder.reload(index, ROOTS, join('/elsewhere', 'x.md'));
    await builder.reload(index, ROOTS, repo('projects', P));
    await builder.reload(index, ROOTS, repo('activity', 'm', 'x.jsonl'));
    const copy = repo('vars', 'ci.timeout 2.yaml');
    fs.files.set(copy, 'x');
    await builder.reload(index, ROOTS, copy);
    const temp = repo('vars', '.ci.timeout.yaml.tmp-1-x');
    fs.files.set(temp, 'x');
    await builder.reload(index, ROOTS, temp);
    expect(index.size).toBe(5);
    expect(index.excluded.conflictCopies().map((c) => c.path)).toEqual([copy]);
    expect(index.excluded.tempFiles().map((t) => t.path)).toEqual([temp]);
  });

  it('replaces the whole view atomically after a rescan', async () => {
    const fs = store();
    const { index } = await build(fs);
    fs.files.delete(repo('projects', P, 'tasks', `${T2}.md`));
    fs.files.set(repo('vars', 'x 2.yaml'), 'x');
    const fresh = await build(fs);
    index.replaceWith(fresh.index);
    expect(index.get(T2)).toBeUndefined();
    expect(index.list('task', P).map((e) => e.id)).toEqual([T1]);
    expect(index.excluded.conflictCopies()).toHaveLength(1);
  });
});

describe('mapLimit', () => {
  it('keeps the input order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});
