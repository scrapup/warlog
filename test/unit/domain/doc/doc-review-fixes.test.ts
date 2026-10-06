import { describe, expect, it } from '@jest/globals';
import { resolve } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { norm } from '../../../support/fakes/memory-file-system.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';

const TOP = resolve('/src/warlog');
const TOKEN = `ghp_${'a'.repeat(36)}`;

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
 * @param relative - Path below the top level.
 * @param content - Content.
 */
function put(h: TrackerHarness, relative: string, content: string): void {
  h.fs.files.set(resolve(TOP, relative), content);
}

/**
 * Snapshot of every file path of the fake file system.
 * @param h - Harness.
 * @returns Sorted file paths.
 */
function fileSet(h: TrackerHarness): string[] {
  return [...h.fs.files.keys()].sort();
}

/**
 * Registers a design document with one image and returns its id.
 * @param h - Harness.
 * @returns The document id.
 */
async function withImage(h: TrackerHarness): Promise<string> {
  put(h, 'docs/specs/core/img/design.md', '# D\n\n![flow](flow.png)\n');
  put(h, 'docs/specs/core/img/flow.png', 'PNG-V1');
  await h.obj('doc_import', { path: 'docs/specs/core/img' });
  return String((await h.rows('doc_list'))[0]?.['id']);
}

describe('validation happens before any byte is written (WL-62)', () => {
  it.each([
    ['tasks together with single-tasks', { 'tasks.md': '## US-1: A\n#### TF-1-1: x\n', 'single-tasks.md': '## US-1: A\n#### TF-1-1: x\n' }],
    ['a missing image', { 'design.md': '# D\n\n![x](missing.png)\n' }],
    ['a secret', { 'design.md': `# D\n\n${TOKEN}\n` }],
    ['a document with a problem next to one that is fine', { 'design.md': '# fine\n', 'spec.md': '# not an SDD spec\n' }],
  ])('rejects %s and leaves the file system exactly as it was', async (_name, files) => {
    const h = trackerHarness();
    for (const [name, text] of Object.entries(files)) {
      put(h, `docs/specs/core/none/${name}`, text);
    }
    const before = fileSet(h);
    await expect(h.call('doc_import', { path: 'docs/specs/core/none' })).rejects.toBeDefined();
    expect(fileSet(h)).toEqual(before);
  });

  it('reports a secret next to the other problems, naming the file and the kind but never the value', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/s/design.md', `# D\n\n${TOKEN}\n\n![x](gone.png)\n`);
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/s' }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
    const text = JSON.stringify(error);
    expect(text).toContain('github-token');
    expect(text).toContain('gone.png');
    expect(text).not.toContain(TOKEN);
  });

  it('keeps the SECRET_REJECTED code when a secret is the only problem, and scans diagram sources and SVG files too', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/p/design.md', '# D\n\n![flow](flow.png)\n');
    put(h, 'docs/specs/core/p/flow.png', 'PNG');
    put(h, 'docs/specs/core/p/flow.puml', `@startuml\nnote: ${TOKEN}\n@enduml\n`);
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/p' }));
    expect(isWarlogError(error, 'SECRET_REJECTED')).toBe(true);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});

describe('images are images (WL-61, WL-62)', () => {
  it.each([
    ['.env', 'hidden files and folders'],
    ['.git/config', 'hidden files and folders'],
    ['notes.txt', 'is not an image or diagram source'],
    ['LICENSE', 'a file without extension'],
  ])('refuses %s as an image', async (name, reason) => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/i/design.md', `# D\n\n![x](${name})\n`);
    put(h, `docs/specs/core/i/${name}`, 'TOKEN=x');
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/i' }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
    expect(JSON.stringify(error)).toContain(reason);
  });

  it('[WL-61] accepts a file name containing an encoded # or ? (the encoding is decoded after the fragment is cut)', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/enc/design.md', '# D\n\n![a](C%23.png)\n![b](what%3F.png)\n');
    put(h, 'docs/specs/core/enc/C#.png', 'PNG');
    put(h, 'docs/specs/core/enc/what?.png', 'PNG');
    const result = await h.obj('doc_import', { path: 'docs/specs/core/enc' });
    expect((result['documents'] as { assets: number }[])[0]?.assets).toBe(2);
  });
});

describe('source_path never carries the home folder', () => {
  it('[WL-60] is relative to the repository for a file inside it, and just the name for one outside it', async () => {
    const h = trackerHarness({ withRepository: false });
    h.fs.files.set(resolve('/home/someone/notes/design.md'), '# D\n');
    await h.call('var_set', { scope: 'global', name: 'docs.import.allowed_roots', value: [resolve('/home/someone')] });
    await h.obj('doc_import', { path: resolve('/home/someone/notes/design.md'), epic: 'e', opportunity: 'o' });
    const meta = [...h.fs.files.entries()].find(([k]) => k.endsWith('design.yaml'));
    expect(meta?.[1]).toContain('source_path: design.md');
    expect(JSON.stringify([...h.fs.files.entries()].filter(([k]) => k.includes('/global/docs/')))).not.toContain('someone');
    const inside = trackerHarness();
    put(inside, 'docs/specs/core/in/design.md', '# D\n');
    await inside.obj('doc_import', { path: 'docs/specs/core/in/design.md' });
    expect([...inside.fs.files.entries()].find(([k]) => k.endsWith('design.yaml'))?.[1]).toContain('source_path: docs/specs/core/in/design.md');
  });
});

describe('doc_export never reports success for an incomplete export (WL-68)', () => {
  it('fails before writing anything when an image cannot be read', async () => {
    const h = trackerHarness();
    const id = await withImage(h);
    const asset = [...h.fs.files.keys()].find((k) => k.endsWith('flow.png') && k.includes('assets')) ?? '';
    h.fs.files.delete(asset);
    const before = fileSet(h);
    const error = await failure(h.call('doc_export', { id, path: 'out' }));
    expect(isWarlogError(error, 'INVALID_FILE')).toBe(true);
    expect(fileSet(h)).toEqual(before);
  });

  it('applies overwrite to the images as well, writing nothing when any destination exists', async () => {
    const h = trackerHarness();
    const id = await withImage(h);
    put(h, 'out/flow.png', 'MY OWN FILE');
    const before = fileSet(h);
    const error = await failure(h.call('doc_export', { id, path: 'out' }));
    expect(isWarlogError(error, 'CONFLICT')).toBe(true);
    expect(fileSet(h)).toEqual(before);
    expect(h.fs.files.get(resolve(TOP, 'out/flow.png'))).toBe('MY OWN FILE');
    await h.obj('doc_export', { id, path: 'out', overwrite: true });
    expect(h.fs.files.get(resolve(TOP, 'out/flow.png'))).toBe('PNG-V1');
  });

  it('exports a kept version with the images of that version', async () => {
    const h = trackerHarness();
    const id = await withImage(h);
    put(h, 'docs/specs/core/img/flow.png', 'PNG-V2');
    await h.obj('doc_import', { path: 'docs/specs/core/img', version: true });
    const result = await h.obj('doc_export', { id, path: 'old', version: 1 });
    expect(result['assets']).toBe(1);
    expect(h.fs.files.get(resolve(TOP, 'old/flow.png'))).toBe('PNG-V1');
    expect(h.fs.files.get(resolve(TOP, 'old/design.md'))).toContain('![flow](flow.png)');
    await h.obj('doc_export', { id, path: 'new' });
    expect(h.fs.files.get(resolve(TOP, 'new/flow.png'))).toBe('PNG-V2');
  });

  it('refuses a destination reached through a symbolic link that leaves the allowed roots', async () => {
    const h = trackerHarness();
    const id = await withImage(h);
    h.fs.dirs.add(resolve('/elsewhere'));
    h.fs.links.set(norm(resolve(TOP, 'out')), norm(resolve('/elsewhere')));
    expect(isWarlogError(await failure(h.call('doc_export', { id, path: 'out' })), 'VALIDATION')).toBe(true);
  });
});

describe('re-registering a document (WL-64)', () => {
  it('never keeps an empty version: an unreadable current content stops the replacement', async () => {
    const h = trackerHarness();
    const id = await withImage(h);
    const stored = [...h.fs.files.keys()].find((k) => k.endsWith('design.md') && k.includes('docs') && !k.includes('src/warlog/docs/specs')) ?? '';
    const before = h.fs.files.get(stored);
    h.fs.files.delete(stored);
    put(h, 'docs/specs/core/img/design.md', '# Changed\n');
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/img', version: true }));
    expect(isWarlogError(error, 'INVALID_FILE')).toBe(true);
    expect((await h.rows('doc_versions', { id })).map((r) => r['version'])).toEqual([1]);
    expect(before).toBeDefined();
  });

  it('refuses version=true for a document registered by reference (it has no stored content to keep)', async () => {
    const h = trackerHarness();
    put(h, 'docs/specs/core/ref/design.md', '# D\n');
    await h.obj('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference' });
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/ref/design.md', mode: 'reference', version: true }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
  });

  it('removes images that are no longer referenced only after the new registration is in place', async () => {
    const h = trackerHarness();
    await withImage(h);
    const asset = (): string | undefined => [...h.fs.files.keys()].find((k) => k.endsWith('flow.png') && k.includes('assets'));
    put(h, 'docs/specs/core/img/design.md', '# D\n');
    const meta = [...h.fs.files.keys()].find((k) => k.endsWith('design.yaml') && !k.includes('versions')) ?? '';
    h.fs.failWrites.add(meta);
    await expect(h.call('doc_import', { path: 'docs/specs/core/img' })).rejects.toBeDefined();
    expect(asset()).toBeDefined();
    h.fs.failWrites.delete(meta);
    await h.obj('doc_import', { path: 'docs/specs/core/img' });
    expect(asset()).toBeUndefined();
  });
});

describe('size and paging boundaries (WL-65, WL-66)', () => {
  it('accepts a 2 MiB document and rejects one byte more, naming the limit', async () => {
    const h = trackerHarness();
    const limit = 2 * 1024 * 1024;
    put(h, 'docs/specs/core/ok/design.md', `# T\n${'x'.repeat(limit - 4)}`);
    expect(Buffer.byteLength(h.fs.files.get(resolve(TOP, 'docs/specs/core/ok/design.md')) ?? '')).toBe(limit);
    await h.obj('doc_import', { path: 'docs/specs/core/ok/design.md' });
    put(h, 'docs/specs/core/big/design.md', `# T\n${'x'.repeat(limit - 3)}`);
    const error = await failure(h.call('doc_import', { path: 'docs/specs/core/big/design.md' }));
    expect(JSON.stringify(error)).toContain('larger than 2 MB');
  });

  it('serves a document of exactly 500 KiB whole and pages one byte more; the pages rebuild the document', async () => {
    const h = trackerHarness();
    const limit = 500 * 1024;
    put(h, 'docs/specs/core/w/design.md', `# T\n${'a'.repeat(limit - 4)}`);
    await h.obj('doc_import', { path: 'docs/specs/core/w/design.md' });
    const [whole] = await h.rows('doc_list');
    expect(await h.obj('doc_get', { id: whole?.['id'] })).not.toHaveProperty('pages');
    const body = Array.from({ length: 8 }, (_, i) => `## Part ${i}\n${'é'.repeat(40_000)}\n`).join('\n');
    const text = `# Paged\n\n${body}`;
    put(h, 'docs/specs/core/p/design.md', text);
    await h.obj('doc_import', { path: 'docs/specs/core/p/design.md' });
    const row = (await h.rows('doc_list')).find((r) => r['opportunity'] === 'p');
    const first = await h.obj('doc_get', { id: row?.['id'] });
    const pages = Number(first['pages']);
    expect(pages).toBeGreaterThan(2);
    const parts: string[] = [];
    for (let page = 1; page <= pages; page += 1) {
      parts.push(String((await h.obj('doc_get', { id: row?.['id'], page }))['content']));
    }
    expect(Buffer.from(parts.join('')).equals(Buffer.from(text))).toBe(true);
  });
});

describe('small input checks', () => {
  it('rejects a search made of spaces, and ignores version folders that are not plain numbers', async () => {
    const h = trackerHarness();
    const id = await withImage(h);
    expect(isWarlogError(await failure(h.call('doc_search', { id, query: '   ' })), 'VALIDATION')).toBe(true);
    const versions = [...h.fs.files.keys()].find((k) => k.endsWith('design.md')) ?? '';
    h.fs.files.set(versions.replace(/design\.md$/, 'x'), 'x');
    h.fs.files.set(resolve(TOP, 'unrelated'), 'x');
    expect((await h.rows('doc_versions', { id })).map((r) => r['version'])).toEqual([1]);
  });
});
