import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { z } from 'zod';
import { IndexBuilder } from '../../../../src/core/index/index-builder.ts';
import { IndexProvider } from '../../../../src/core/index/index-provider.ts';
import { LiveIndexSource, pointOnly } from '../../../../src/core/index/index-source.ts';
import { StoreIndex } from '../../../../src/core/index/store-index.ts';
import type { OperationDefinition } from '../../../../src/core/mediator/operation-definition.ts';
import { PathGuard } from '../../../../src/core/security/path-guard.ts';
import { stringifyFrontMatter } from '../../../../src/core/storage/front-matter-codec.ts';
import type { StoreRoots } from '../../../../src/core/storage/store-roots.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { FixedClock } from '../../../support/fakes/simple-fakes.ts';
import { fixtureDeps } from '../../../support/fixture-deps.ts';
import { fixtureOperation } from '../../../support/fixture-operations.ts';
import { GLOBAL_ROOT, REPO_ROOT } from '../../../support/store-fixture.ts';

const ROOTS: StoreRoots = { global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo', mainWorktree: join(REPO_ROOT, '..') }, warnings: [] };
const M = '01J00000000000000000000M01';
const P = '01J00000000000000000000P01';
const T = '01J00000000000000000000T01';

/**
 * An entity file.
 * @param data - Front matter.
 * @returns Content.
 */
function file(data: Record<string, unknown>): string {
  return stringifyFrontMatter({ data: { rev: 1, created_at: 'x', updated_at: 'x', machine: 'm', ...data }, body: '' });
}

/**
 * A store with a memory and a task.
 * @returns File system.
 */
function store(): MemoryFileSystem {
  return new MemoryFileSystem({
    [join(GLOBAL_ROOT, 'global', 'memories', `${M}.md`)]: file({ id: M, type: 'memory' }),
    [join(REPO_ROOT, 'projects', P, 'tasks', `${T}.md`)]: file({ id: T, type: 'task', project_id: P }),
  });
}

/**
 * A provider over a file system.
 * @param fs - File system.
 * @param mode - Profile.
 * @param onBuilt - Build callback.
 * @returns Provider.
 */
function provider(fs: MemoryFileSystem, mode: 'lazy' | 'live', onBuilt?: () => void): IndexProvider {
  return new IndexProvider({ fs, builder: new IndexBuilder({ fs, clock: new FixedClock() }), guard: new PathGuard(fs), mode, ...(onBuilt === undefined ? {} : { onBuilt }) });
}

describe('lazy index source (command line)', () => {
  it('reads a point entity from its file without scanning any directory', async () => {
    const fs = store();
    const source = provider(fs, 'lazy').sourceFor(ROOTS);
    expect(await source.entity({ type: 'task', id: T, scope: 'repo', projectId: P })).toMatchObject({ id: T, projectId: P });
    expect(await source.entity({ type: 'memory', id: M, scope: 'global' })).toMatchObject({ id: M, scope: 'global' });
    expect(fs.readDirCalls).toBe(0);
  });

  it('returns nothing for missing, invalid, directory or mistyped files', async () => {
    const fs = store();
    fs.files.set(join(REPO_ROOT, 'memories', `${M}.md`), 'broken');
    fs.dirs.add(join(GLOBAL_ROOT, 'global', 'memories', '01J00000000000000000000M02.md'));
    const source = provider(fs, 'lazy').sourceFor(ROOTS);
    expect(await source.entity({ type: 'memory', id: '01J00000000000000000000M09', scope: 'global' })).toBeUndefined();
    expect(await source.entity({ type: 'memory', id: M, scope: 'repo' })).toBeUndefined();
    expect(await source.entity({ type: 'memory', id: '01J00000000000000000000M02', scope: 'global' })).toBeUndefined();
    fs.files.set(join(GLOBAL_ROOT, 'global', 'memories', `${M}.md`), file({ id: M, type: 'note' }));
    expect(await source.entity({ type: 'memory', id: M, scope: 'global' })).toBeUndefined();
  });

  it('builds the full index once and then serves point reads from it', async () => {
    const fs = store();
    const source = provider(fs, 'lazy').sourceFor(ROOTS);
    const index = await source.full();
    expect(await source.full()).toBe(index);
    const calls = fs.readDirCalls;
    expect(await source.entity({ type: 'task', id: T, scope: 'repo', projectId: P })).toBe(index.get(T));
    expect(await source.entity({ type: 'memory', id: T, scope: 'global' })).toBeUndefined();
    expect(fs.readDirCalls).toBe(calls);
  });
});

describe('live index source (MCP server)', () => {
  it('builds each roots index once, reports it and serves both access paths', async () => {
    let built = 0;
    const fs = store();
    const live = provider(fs, 'live', () => {
      built += 1;
    });
    const a = live.sourceFor(ROOTS);
    const b = live.sourceFor(ROOTS);
    expect(await a.full()).toBe(await b.full());
    expect((await a.entity({ type: 'memory', id: M, scope: 'global' }))?.id).toBe(M);
    expect(built).toBe(1);
  });

  it('retries a build that failed', async () => {
    const fs = store();
    const real = fs.readDir.bind(fs);
    let fail = true;
    fs.readDir = async (path, options) => {
      if (fail) {
        throw new Error('EMFILE');
      }
      return real(path, options);
    };
    const live = provider(fs, 'live');
    await expect(live.ensure(ROOTS)).rejects.toThrow('EMFILE');
    fail = false;
    expect((await live.ensure(ROOTS)).size).toBe(2);
  });

  it('wraps an existing index', async () => {
    const index = new StoreIndex();
    const source = new LiveIndexSource(index);
    expect(await source.full()).toBe(index);
    expect(await source.entity({ type: 'memory', id: M, scope: 'global' })).toBeUndefined();
  });
});

describe('load modes in the pipeline', () => {
  it('refuses a full index to an operation declared load: point', async () => {
    const point: OperationDefinition = {
      ...fixtureOperation('fixture_echo'),
      name: 'fixture_point',
      action: 'point',
      load: 'point',
      input: z.object({}),
      examples: [{}],
      handler: {
        handle: async (_input, context) => {
          await context.index.full();
          return { kind: 'scalar', value: 'scanned' };
        },
      },
    };
    const full: OperationDefinition = { ...point, name: 'fixture_full', action: 'full', load: 'full' };
    const deps = fixtureDeps([point, full]);
    await expect(deps.mediator.send('fixture_point', {})).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(deps.store.logger.events.map((e) => e.event)).toEqual(['op.failed']);
    expect((await deps.mediator.send('fixture_full', {})).result).toEqual({ kind: 'scalar', value: 'scanned' });
  });

  it('keeps point reads available to point operations', async () => {
    const inner = new LiveIndexSource(new StoreIndex());
    const restricted = pointOnly(inner, 'x');
    expect(await restricted.entity({ type: 'memory', id: M, scope: 'global' })).toBeUndefined();
    await expect(restricted.full()).rejects.toMatchObject({ code: 'INTERNAL', details: { operation: 'x' } });
  });
});
