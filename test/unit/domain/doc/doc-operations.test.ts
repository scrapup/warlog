import { describe, expect, it } from '@jest/globals';
import { resolve } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';

const TOP = resolve('/src/warlog');
const SPEC = ['# Core spec', '', ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`## ${n}. Section ${n}`, `Text of section ${n} about rollback.`, ''])].join('\n');

/**
 * Captures the error of a promise.
 * @param promise - Promise expected to fail.
 * @returns The error.
 */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a failure');
    },
    (error: unknown) => error,
  );
}

/**
 * Puts a file in the fake working tree.
 * @param h - Harness.
 * @param relative - Path below the repository top level.
 * @param content - Content.
 */
function put(h: TrackerHarness, relative: string, content: string): void {
  h.fs.files.set(resolve(TOP, relative), content);
}

/**
 * Registers the standard spec and returns its summary row.
 * @param h - Harness.
 * @returns The first document summary.
 */
async function importSpec(h: TrackerHarness): Promise<Record<string, unknown>> {
  put(h, 'docs/specs/core/alpha/spec.md', SPEC);
  const result = await h.obj('doc_import', { path: 'docs/specs/core/alpha/spec.md' });
  return (result['documents'] as Record<string, unknown>[])[0] ?? {};
}

describe('doc_import', () => {
  it('[WL-57] [WL-59] [WL-60] registers a file by path and answers a short summary without its content', async () => {
    const h = trackerHarness();
    const result = await h.obj('doc_import', { path: await put0(h) });
    expect(result).toMatchObject({ area: 'repo', epic: 'core', opportunity: 'alpha', mode: 'copy' });
    expect(JSON.stringify(result)).not.toContain('Text of section');
    expect((result['documents'] as Record<string, unknown>[])[0]).toMatchObject({ kind: 'spec', version: 1, sections: 7, assets: 0 });
  });

  it('[WL-58] an opportunity folder registers every Markdown file once per kind', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/beta/spec.md', SPEC);
    put(h, 'docs/specs/core/beta/single-tasks.md', '# T\n\n## US-1: A\n\n#### TF-1-1: x\n');
    const result = await h.obj('doc_import', { path: 'docs/specs/core/beta' });
    expect((result['documents'] as { kind: string }[]).map((d) => d.kind).sort()).toEqual(['single-tasks', 'spec']);
  });

  it('[WL-58] tasks and single-tasks together are rejected and nothing is written', async () => {
    const h = trackerHarness();
    const backlog = '# T\n\n## US-1: A\n\n#### TF-1-1: x\n';
    put(h, 'docs/specs/core/gamma/tasks.md', backlog);
    put(h, 'docs/specs/core/gamma/single-tasks.md', backlog);
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/gamma' }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
    expect(await h.rows('doc_list')).toEqual([]);
  });

  it('[WL-62] validates before writing: SDD structure, missing images and secrets', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/delta/spec.md', '# Spec\n\n![d](missing.png)\n');
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/delta/spec.md' }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
    expect(await h.rows('doc_list')).toEqual([]);
    put(h, 'docs/specs/core/delta/design.md', '# D\n\ntoken ghp_abcdefghijklmnopqrstuvwxyz0123456789\n');
    expect(isWarlogError(await failure(h.call('doc_import', { path: 'docs/specs/core/delta/design.md' })), 'SECRET_REJECTED')).toBe(true);
  });

  it('[WL-61] copies images with their diagram sources and rewrites the links', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/eps/design.md', '# D\n\n![flow](diagrams/flow.png)\n');
    put(h, 'docs/specs/core/eps/diagrams/flow.png', 'PNG');
    put(h, 'docs/specs/core/eps/diagrams/flow.puml', '@startuml\n@enduml\n');
    const result = await h.obj('doc_import', { path: 'docs/specs/core/eps' });
    expect((result['documents'] as { assets: number }[])[0]?.assets).toBe(2);
    const [row] = await h.rows('doc_list');
    const got = await h.obj('doc_get', { id: row?.['id'] });
    expect(String(got['content'])).toContain('![flow](assets/design/diagrams/flow.png)');
  });

  it('[WL-61] [WL-66] the section index matches the stored Markdown after image links are rewritten', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/idx/design.md', '# D\n\n## Flow\n\n![flow](diagrams/flow.png)\n\nRollback is manual.\n\n## Notes\n\nNothing.\n');
    put(h, 'docs/specs/core/idx/diagrams/flow.png', 'PNG');
    await h.obj('doc_import', { path: 'docs/specs/core/idx' });
    const [row] = await h.rows('doc_list');
    expect((await h.obj('doc_get', { id: row?.['id'], section: 'notes' }))['content']).toBe('## Notes\n\nNothing.\n');
    expect(String((await h.obj('doc_get', { id: row?.['id'], section: 'flow' }))['content'])).toMatch(/^## Flow[\s\S]*Rollback is manual\.\n\n$/);
  });

  it('[WL-65] rejects a Markdown document above 2 MB', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/zeta/design.md', `# Big\n\n${'x'.repeat(2 * 1024 * 1024)}`);
    expect(isWarlogError(await failure(h.call('doc_import', { path: 'docs/specs/core/zeta/design.md' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-69] refuses paths outside the repository and links leaving the folder tree', async () => {
    const h = trackerHarness();
    h.fs.files.set(resolve('/elsewhere/spec.md'), SPEC);
    expect(isWarlogError(await failure(h.call('doc_import', { path: resolve('/elsewhere/spec.md') })), 'VALIDATION')).toBe(true);
    put(h, 'docs/specs/core/eta/design.md', '# D\n\n![x](../../secret.png)\n');
    put(h, 'docs/secret.png', 'PNG');
    expect(isWarlogError(await failure(h.call('doc_import', { path: 'docs/specs/core/eta/design.md' })), 'VALIDATION')).toBe(true);
  });

  it('[WL-63] stores the content as is', async () => {
    const h = trackerHarness();
    const row = await importSpec(h);
    expect((await h.obj('doc_get', { id: row['id'] }))['content']).toBe(SPEC);
  });

  it('[WL-64] re-registering replaces the document; version=true keeps the previous content', async () => {
    const h = trackerHarness();
    const first = await importSpec(h);
    put(h, 'docs/specs/core/alpha/spec.md', `${SPEC}\nExtra.\n`);
    const replaced = (await h.obj('doc_import', { path: 'docs/specs/core/alpha/spec.md' }))['documents'] as Record<string, unknown>[];
    expect(replaced[0]).toMatchObject({ id: first['id'], version: 1 });
    expect((await h.rows('doc_versions', { id: first['id'] })).length).toBe(1);
    put(h, 'docs/specs/core/alpha/spec.md', `${SPEC}\nThird.\n`);
    const kept = (await h.obj('doc_import', { path: 'docs/specs/core/alpha/spec.md', version: true }))['documents'] as Record<string, unknown>[];
    expect(kept[0]).toMatchObject({ id: first['id'], version: 2 });
    expect((await h.obj('doc_get', { id: first['id'], version: 1 }))['content']).toContain('Extra.');
    expect((await h.rows('doc_versions', { id: first['id'] })).map((r) => r['version'])).toEqual([1, 2]);
  });
});

/**
 * Puts the standard spec under `docs/specs/core/alpha`.
 * @param h - Harness.
 * @returns The relative path.
 */
async function put0(h: TrackerHarness): Promise<string> {
  put(h, 'docs/specs/core/alpha/spec.md', SPEC);
  return 'docs/specs/core/alpha/spec.md';
}

describe('doc reading', () => {
  it('[WL-66] doc_toc lists the heading tree and doc_get reads one section', async () => {
    const h = trackerHarness();
    const row = await importSpec(h);
    const toc = await h.rows('doc_toc', { id: row['id'] });
    expect(toc[0]).toMatchObject({ level: 1, title: 'Core spec' });
    const section = await h.obj('doc_get', { id: row['id'], section: '2-section-2' });
    expect(String(section['content'])).toContain('Text of section 2');
    expect(String(section['content'])).not.toContain('Text of section 3');
    expect(isWarlogError(await failure(h.call('doc_get', { id: row['id'], section: 'nope' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-66] doc_search returns the matching sections', async () => {
    const h = trackerHarness();
    const row = await importSpec(h);
    expect((await h.rows('doc_search', { id: row['id'], query: 'rollback' })).length).toBe(7);
    expect(await h.rows('doc_search', { id: row['id'], query: 'nonexistent' })).toEqual([]);
  });

  it('[WL-66] a document above 500 KB returns the index and the first page, the rest by page', async () => {
    const h = trackerHarness();
    const body = Array.from({ length: 12 }, (_, i) => `## Part ${i}\n${'word '.repeat(20_000)}\n`).join('\n');
    put(h, 'docs/specs/core/big/design.md', `# Big\n\n${body}`);
    await h.obj('doc_import', { path: 'docs/specs/core/big/design.md' });
    const [row] = await h.rows('doc_list');
    const first = await h.obj('doc_get', { id: row?.['id'] });
    expect(first).toMatchObject({ page: 1 });
    expect(Number(first['pages'])).toBeGreaterThan(1);
    expect(first['toc']).toBeDefined();
    expect(Buffer.byteLength(String(first['content']))).toBeLessThanOrEqual(100 * 1024);
    expect(isWarlogError(await failure(h.call('doc_get', { id: row?.['id'], page: 999 })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-67] listings filter and sort by dates', async () => {
    const h = trackerHarness();
    await importSpec(h);
    put(h, 'docs/specs/core/other/design.md', '# O\n');
    await h.obj('doc_import', { path: 'docs/specs/core/other/design.md' });
    expect((await h.rows('doc_list', { order: 'asc' })).map((r) => r['kind'])).toEqual(['spec', 'design']);
    expect((await h.rows('doc_list', { since: '2999-01-01T00:00:00Z' })).length).toBe(0);
    expect((await h.rows('doc_history', {})).length).toBe(2);
    expect((await h.rows('doc_epic_list', {})).map((r) => r['slug'])).toEqual(['core']);
    expect((await h.rows('opportunity_list', { epic: 'core' })).map((r) => r['slug']).sort()).toEqual(['alpha', 'other']);
  });
});

describe('doc_export', () => {
  it('[WL-68] writes the document and its images back to a folder and restores the links', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/eps/design.md', '# D\n\n![flow](diagrams/flow.png)\n');
    put(h, 'docs/specs/core/eps/diagrams/flow.png', 'PNG');
    await h.obj('doc_import', { path: 'docs/specs/core/eps/design.md' });
    const [row] = await h.rows('doc_list');
    const out = await h.obj('doc_export', { id: row?.['id'], path: 'out' });
    expect(out['assets']).toBe(1);
    expect(h.fs.files.get(resolve(TOP, 'out/design.md'))).toContain('![flow](diagrams/flow.png)');
    expect(h.fs.files.get(resolve(TOP, 'out/diagrams/flow.png'))).toBe('PNG');
    expect(isWarlogError(await failure(h.call('doc_export', { id: row?.['id'], path: 'out' })), 'CONFLICT')).toBe(true);
    await h.obj('doc_export', { id: row?.['id'], path: 'out', overwrite: true });
    expect(isWarlogError(await failure(h.call('doc_export', { id: row?.['id'], path: '/elsewhere' })), 'VALIDATION')).toBe(true);
  });
});

describe('doc_export from a folder import', () => {
  it('[WL-68] names the exported file after the document, not the folder', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/fold/design.md', '# D\n');
    await h.obj('doc_import', { path: 'docs/specs/core/fold' });
    const [row] = await h.rows('doc_list');
    await h.obj('doc_export', { id: row?.['id'], path: 'out' });
    expect(h.fs.files.get(resolve(TOP, 'out/design.md'))).toBe('# D\n');
  });
});

describe('reference mode', () => {
  it('[WL-73] stores no content, reports a changed file and refreshes the index on read', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/ref/design.md', '# D\n\n## One\n');
    await h.obj('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference' });
    const [row] = await h.rows('doc_list');
    expect(row).toMatchObject({ mode: 'reference' });
    expect(await h.obj('doc_get', { id: row?.['id'] })).not.toHaveProperty('changed_since_registration');
    put(h, 'docs/specs/core/ref/design.md', '# D\n\n## One\n\n## Two\n');
    expect(await h.obj('doc_get', { id: row?.['id'] })).toMatchObject({ changed_since_registration: true });
    expect((await h.rows('doc_toc', { id: row?.['id'] })).length).toBe(3);
  });

  it('[WL-73] a moved or deleted referenced file is a broken reference', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/ref/design.md', '# D\n');
    await h.obj('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference' });
    const [row] = await h.rows('doc_list');
    h.fs.files.delete(resolve(TOP, 'docs/specs/core/ref/design.md'));
    const error = await failure(h.call('doc_get', { id: row?.['id'] }));
    expect(isWarlogError(error, 'INVALID_FILE')).toBe(true);
  });

  it('[WL-73] is allowed only for repository files and cannot keep versions', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/ref/design.md', '# D\n');
    expect(isWarlogError(await failure(h.call('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference', area: 'global' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference', version: true })), 'VALIDATION')).toBe(true);
  });
});

describe('doctor document references', () => {
  it('[WL-45] [WL-73] lists referenced documents that changed or disappeared', async () => {
    const h = trackerHarness({ mode: 'live' });
    put(h, 'docs/specs/core/ref/design.md', '# D\n');
    put(h, 'docs/specs/core/ref/adr.md', '# A\n');
    await h.obj('doc_import', { path: 'docs/specs/core/ref', mode: 'reference' });
    expect((await h.obj('doctor'))['document_references']).toEqual([]);
    put(h, 'docs/specs/core/ref/design.md', '# D2\n');
    h.fs.files.delete(resolve(TOP, 'docs/specs/core/ref/adr.md'));
    const refs = (await h.obj('doctor'))['document_references'] as { path: string; status: string }[];
    expect(refs.map((r) => [r.path, r.status]).sort()).toEqual([['docs/specs/core/ref/adr.md', 'broken'], ['docs/specs/core/ref/design.md', 'changed']]);
  });

  it('[WL-45] reports nothing outside a repository', async () => {
    const h = trackerHarness({ mode: 'live', withRepository: false });
    expect((await h.obj('doctor'))['document_references']).toEqual([]);
  });
});

describe('document areas', () => {
  it('[WL-59] the repository area needs a repository; the global area reads allowed roots only', async () => {
    const h = trackerHarness({ withRepository: false });
    h.fs.files.set(resolve('/notes/design.md'), '# D\n');
    expect(isWarlogError(await failure(h.call('doc_import', { path: resolve('/notes/design.md'), epic: 'e', opportunity: 'o' })), 'VALIDATION')).toBe(true);
    await h.call('var_set', { scope: 'global', name: 'docs.import.allowed_roots', value: [resolve('/notes')] });
    const result = await h.obj('doc_import', { path: resolve('/notes/design.md'), epic: 'e', opportunity: 'o' });
    expect(result).toMatchObject({ area: 'global', epic: 'e', opportunity: 'o' });
  });
});
