import { describe, expect, it } from '@jest/globals';
import { resolve } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';

const TOP = resolve('/src/warlog');

/**
 * Puts a file in the fake working tree.
 * @param h - Harness.
 * @param relative - Path below the top level.
 * @param content - Content.
 */
function put(h: TrackerHarness, relative: string, content: string): void {
  h.fs.files.set(resolve(TOP, relative), content);
}

/**
 * Messages of the validation problems of a failed import.
 * @param h - Harness.
 * @param input - Import input.
 * @returns The problem messages.
 */
async function problems(h: TrackerHarness, input: Record<string, unknown>): Promise<string> {
  const error = await h.call('doc_import', input).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(isWarlogError(error, 'VALIDATION')).toBe(true);
  return JSON.stringify((error as { details?: unknown }).details ?? '') + String((error as Error).message);
}

describe('image validation', () => {
  it.each([
    ['![x](https://example.com/a.png)', 'remote or absolute'],
    ['![x](data:image/png;base64,AAAA)', 'remote or absolute'],
    ['![x](C:/a.png)', 'remote or absolute'],
    ['![x](/etc/a.png)', 'relative path'],
    ['![x](a\\b.png)', 'relative path'],
    ['![x](../a.png)', 'leaves the document folder tree'],
    ['![x](a/../../a.png)', 'leaves the document folder tree'],
    ['![x](<>)', 'empty'],
    ['![x](#frag)', 'empty'],
    ['![x](missing.png)', 'does not exist'],
    ['![x](dir)', 'is not a file'],
  ])('[WL-62] [WL-69] rejects %s', async (link, reason) => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', `# D\n\n${link}\n`);
    h.fs.dirs.add(resolve(TOP, 'docs/specs/e/o/dir'));
    expect(await problems(h, { path: 'docs/specs/e/o/design.md' })).toContain(reason);
  });

  it('[WL-69] a symbolic link leading outside the folder tree is rejected', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', '# D\n\n![x](link.png)\n');
    put(h, 'docs/secret.png', 'PNG');
    h.fs.links.set(resolve(TOP, 'docs/specs/e/o/link.png'), resolve(TOP, 'docs/secret.png'));
    expect(await problems(h, { path: 'docs/specs/e/o/design.md' })).toContain('outside the document folder tree');
  });

  it('[WL-65] an image above 10 MB is rejected', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', '# D\n\n![x](big.png)\n');
    put(h, 'docs/specs/e/o/big.png', 'x'.repeat(10 * 1024 * 1024 + 1));
    expect(await problems(h, { path: 'docs/specs/e/o/design.md' })).toContain('larger than 10 MB');
  });

  it('[WL-61] percent-encoded destinations, queries and a shared image are collected once', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', '# D\n\n![a](my%20pic.png?raw=1)\n![b](my pic.png#x)\n![c](<my pic.png>)\n');
    put(h, 'docs/specs/e/o/my pic.png', 'PNG');
    const result = await h.obj('doc_import', { path: 'docs/specs/e/o/design.md' });
    expect((result['documents'] as { assets: number }[])[0]?.assets).toBe(1);
  });
});

describe('registration planning', () => {
  it('[WL-60] a folder without Markdown files is rejected', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/readme.txt', 'x');
    expect(await problems(h, { path: 'docs/specs/e/o' })).toContain('no Markdown');
  });

  it('[WL-59] epic and opportunity must be slugs, taken from the folders or given', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/Bad Epic/o/design.md', '# D\n');
    expect(await problems(h, { path: 'docs/specs/Bad Epic/o/design.md' })).toContain('not a slug');
    const ok = await h.obj('doc_import', { path: 'docs/specs/Bad Epic/o/design.md', epic: 'fixed' });
    expect(ok).toMatchObject({ epic: 'fixed', opportunity: 'o' });
  });

  it('[WL-58] two files of one kind in a folder are rejected', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/one.md', '# 1\n');
    put(h, 'docs/specs/e/o/two.md', '# 2\n');
    expect(await problems(h, { path: 'docs/specs/e/o' })).toContain('at most one other document');
    put(h, 'docs/specs/e/o2/one.md', '# 1\n');
    expect(await h.obj('doc_import', { path: 'docs/specs/e/o2/one.md', kind: 'adr' })).toMatchObject({ opportunity: 'o2' });
  });

  it('[WL-62] collects the problems of every document before failing', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/spec.md', '# S\n');
    put(h, 'docs/specs/e/o/design.md', '![x](nope.png)\n');
    const text = await problems(h, { path: 'docs/specs/e/o' });
    expect(text).toContain('missing section');
    expect(text).toContain('nope.png');
  });

  it('[WL-62] warns about inline HTML images and documents without headings', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', 'no headings <img src="x.png">\n');
    const result = await h.obj('doc_import', { path: 'docs/specs/e/o/design.md' });
    const warnings = (result['documents'] as { warnings: string[] }[])[0]?.warnings ?? [];
    expect(warnings.map((w) => w.split(':')[0])).toEqual(['html_image_not_checked', 'no_headings']);
  });

  it('[WL-58] a registered backlog conflicts with a new one of the other kind', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/tasks.md', '## US-1: A\n#### TF-1-1: x\n');
    await h.obj('doc_import', { path: 'docs/specs/e/o/tasks.md' });
    put(h, 'docs/specs/e/o/single-tasks.md', '## US-1: A\n#### TF-1-1: x\n');
    expect(await problems(h, { path: 'docs/specs/e/o/single-tasks.md' })).toContain('never both');
  });

  it('[WL-60] a missing path is NOT_FOUND', async () => {
    const h = trackerHarness();
    const error = await h.call('doc_import', { path: 'docs/none.md' }).catch((e: unknown) => e);
    expect(isWarlogError(error, 'NOT_FOUND')).toBe(true);
  });

  it('[WL-64] a re-registration drops assets no longer referenced and keeps links and ids', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', '# D\n\n![x](a.png)\n');
    put(h, 'docs/specs/e/o/a.png', 'A');
    await h.obj('doc_import', { path: 'docs/specs/e/o/design.md', version: true });
    put(h, 'docs/specs/e/o/design.md', '# D\n');
    await h.obj('doc_import', { path: 'docs/specs/e/o/design.md', version: true });
    const [row] = await h.rows('doc_list');
    expect([...h.fs.files.keys()].some((k) => k.includes('assets/design/a.png') && !k.includes('versions'))).toBe(false);
    expect([...h.fs.files.keys()].some((k) => k.includes('versions/design/1/assets/a.png'))).toBe(true);
    expect(row).toMatchObject({ version: 2 });
  });
});

describe('document lookups', () => {
  it('[WL-66] unknown documents and versions are NOT_FOUND', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', '# D\n');
    await h.obj('doc_import', { path: 'docs/specs/e/o/design.md' });
    const [row] = await h.rows('doc_list');
    for (const [name, input] of [['doc_get', { id: 'nope' }], ['doc_toc', { id: 'nope' }], ['doc_get', { id: row?.['id'], version: 9 }]] as const) {
      expect(isWarlogError(await h.call(name, input).catch((e: unknown) => e), 'NOT_FOUND')).toBe(true);
    }
  });

  it('[WL-67] sorts by creation date and filters with until', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/e/o/design.md', '# D\n');
    await h.obj('doc_import', { path: 'docs/specs/e/o/design.md' });
    expect((await h.rows('doc_list', { sort_by: 'created_at', until: '2999-01-01T00:00:00Z' })).length).toBe(1);
    expect((await h.rows('doc_list', { until: '2000-01-01T00:00:00Z' })).length).toBe(0);
    expect((await h.rows('doc_epic_list', { area: 'global' })).length).toBe(0);
  });
});
