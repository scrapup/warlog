import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { IndexBuilder } from '../../../../src/core/index/index-builder.ts';
import { LiveIndexSource } from '../../../../src/core/index/index-source.ts';
import { StoreIndex } from '../../../../src/core/index/store-index.ts';
import type { EntityLink } from '../../../../src/core/ports/store-view.port.ts';
import { stringifyFrontMatter } from '../../../../src/core/storage/front-matter-codec.ts';
import { DoctorHandler, STALE_TEMP_MS } from '../../../../src/domain/health/doctor.handler.ts';
import { doctorOperation } from '../../../../src/domain/health/doctor.operation.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { FixedClock, RecordingLogger } from '../../../support/fakes/simple-fakes.ts';
import { FixtureContextFactory } from '../../../support/fixture-context.ts';
import { fixtureDeps } from '../../../support/fixture-deps.ts';
import { GLOBAL_ROOT, REPO_ROOT } from '../../../support/store-fixture.ts';

const NOW = new FixedClock().now().getTime();
const M1 = '01J00000000000000000000M01';
const M2 = '01J00000000000000000000M02';
const MISSING = '01J00000000000000000000X99';

/**
 * A memory file.
 * @param id - Id.
 * @param extra - Extra front matter.
 * @returns Content.
 */
function memory(id: string, extra: Record<string, unknown> = {}): string {
  return stringifyFrontMatter({ data: { id, type: 'memory', rev: 1, created_at: 'x', updated_at: 'x', machine: 'm', ...extra }, body: '' });
}

/** No referenced documents. */
const NO_REFERENCES = async (): Promise<[]> => [];

/**
 * Runs `doctor` over a file system.
 * @param fs - File system.
 * @returns The report.
 */
async function report(fs: MemoryFileSystem): Promise<Record<string, unknown>> {
  const { index } = await new IndexBuilder({ fs, clock: new FixedClock() }).build({ global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo', mainWorktree: REPO_ROOT }, warnings: [] });
  const contexts = new FixtureContextFactory();
  contexts.index = new LiveIndexSource(index);
  const result = await new DoctorHandler(new RecordingLogger(), NO_REFERENCES).handle({}, await contexts.create());
  return result.kind === 'object' ? (result.value as Record<string, unknown>) : {};
}

describe('doctor', () => {
  it('[WL-45] lists every category of problem and writes nothing', async () => {
    const mem = (name: string): string => join(REPO_ROOT, 'memories', name);
    const fs = new MemoryFileSystem({
      [mem(`${M1}.md`)]: memory(M1, { links: [{ rel: 'relates', target: MISSING }] }),
      [mem(`${M2} (conflicted copy).md`)]: memory(M2),
      [mem('01J00000000000000000000M03.md')]: '---\nid: x\n<<<<<<< HEAD\n=======\n>>>>>>> b\n---\n',
      [mem('01J00000000000000000000M04.md')]: 'no front matter',
      [mem(`.${M1}.md.tmp-1-old`)]: 'partial',
      [mem(`.${M1}.md.tmp-2-new`)]: 'partial',
    });
    fs.mtimes.set(mem(`.${M1}.md.tmp-1-old`), NOW - STALE_TEMP_MS - 60_000);
    fs.mtimes.set(mem(`.${M1}.md.tmp-2-new`), NOW - 1_000);
    const before = new Map(fs.files);
    expect(await report(fs)).toEqual({
      healthy: false,
      conflict_copies: [{ root: 'repo', path: `memories/${M2} (conflicted copy).md` }],
      merge_conflicts: [{ root: 'repo', path: 'memories/01J00000000000000000000M03.md' }],
      invalid_files: [{ root: 'repo', path: 'memories/01J00000000000000000000M04.md', reason: 'front_matter' }],
      pending_links: [{ from: M1, rel: 'relates', target: MISSING }],
      document_references: [],
      memories_due_for_review: [],
      stale_temp_files: [{ root: 'repo', path: `memories/.${M1}.md.tmp-1-old`, age_minutes: 61 }],
    });
    expect(new Map(fs.files)).toEqual(before);
  });

  it('[WL-45] reports a healthy store', async () => {
    expect(await report(new MemoryFileSystem({ [join(GLOBAL_ROOT, 'global', 'memories', `${M1}.md`)]: memory(M1) }))).toMatchObject({ healthy: true, pending_links: [] });
  });

  it('reports a failing probe by category, logs it with codes only and keeps the other sections', async () => {
    /** A view whose pending-link probe fails. */
    class BrokenLinksIndex extends StoreIndex {
      /**
       * Fails.
       * @returns Never.
       * @throws {TypeError} Always.
       */
      override pendingLinks(): EntityLink[] {
        throw new TypeError('boom');
      }
    }
    const contexts = new FixtureContextFactory();
    contexts.index = new LiveIndexSource(new BrokenLinksIndex());
    const logger = new RecordingLogger();
    const result = await new DoctorHandler(logger, NO_REFERENCES).handle({}, await contexts.create());
    expect(result).toMatchObject({ kind: 'object', value: { healthy: false, pending_links: { error: 'INTERNAL' }, conflict_copies: [] } });
    expect(logger.events).toEqual([{ level: 'error', event: 'doctor.probe_failed', fields: { section: 'pending_links', error_code: 'UNEXPECTED', error_name: 'TypeError' } }]);
  });

  it.each([
    [STALE_TEMP_MS, []],
    [STALE_TEMP_MS + 1, [60]],
  ])('reports a temp file only when older than one hour (age %i ms)', async (age, minutes) => {
    const temp = join(REPO_ROOT, 'memories', `.${M1}.md.tmp-1-x`);
    const fs = new MemoryFileSystem({ [temp]: 'partial' });
    fs.mtimes.set(temp, NOW - age);
    const value = await report(fs);
    expect((value['stale_temp_files'] as { age_minutes: number }[]).map((t) => t.age_minutes)).toEqual(minutes);
  });

  it('[WL-35] is a top-level read-only operation that needs the full index', async () => {
    expect(doctorOperation(new RecordingLogger(), NO_REFERENCES)).toMatchObject({ name: 'doctor', group: 'doctor', action: '', kind: 'query', load: 'full' });
    const deps = fixtureDeps([doctorOperation(new RecordingLogger(), NO_REFERENCES)]);
    expect((await deps.mediator.send('doctor', {})).result).toMatchObject({ kind: 'object', value: { healthy: true } });
  });
});
