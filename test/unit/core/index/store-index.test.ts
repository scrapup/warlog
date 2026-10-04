import { describe, expect, it } from '@jest/globals';
import { join, sep } from 'node:path';
import { EMPTY_ACTIVITY } from '../../../../src/core/index/activity-aggregator.ts';
import { readStoreFile } from '../../../../src/core/index/entity-reader.ts';
import type { IndexedEntity } from '../../../../src/core/index/indexed-entity.ts';
import { StoreIndex } from '../../../../src/core/index/store-index.ts';
import { REPO_ROOT } from '../../../support/store-fixture.ts';

const A = '01J00000000000000000000A01';
const B = '01J00000000000000000000B01';
const X = '01J00000000000000000000X01';
const Y = '01J00000000000000000000Y01';

/**
 * An indexed note.
 * @param id - Id.
 * @param path - File path.
 * @param data - Extra front matter.
 * @returns The entity.
 */
function note(id: string, path: string, data: Record<string, unknown> = {}): IndexedEntity {
  return { id, type: 'note', scope: 'repo', projectId: undefined, path, record: { data: { id, type: 'note', ...data }, body: '' }, deleted: false };
}

describe('StoreIndex', () => {
  it('moves an entity to its new file and orders pending links by source then target', () => {
    const index = new StoreIndex();
    index.upsert(note(A, join(REPO_ROOT, 'old.md'), { links: [{ rel: 'relates', target: Y }, { rel: 'relates', target: X }] }));
    index.upsert(note(A, join(REPO_ROOT, 'new.md'), { links: [{ rel: 'relates', target: Y }, { rel: 'relates', target: X }] }));
    index.upsert(note(B, join(REPO_ROOT, 'b.md'), { links: [{ rel: 'relates', target: X }] }));
    expect(index.get(A)?.path).toBe(join(REPO_ROOT, 'new.md'));
    expect(index.size).toBe(2);
    expect(index.pendingLinks().map((l) => `${l.from}>${l.target}`)).toEqual([`${A}>${X}`, `${A}>${Y}`, `${B}>${X}`]);
    expect(index.activity).toBe(EMPTY_ACTIVITY);
  });

  it('forgets a directory and keeps unrelated files', () => {
    const index = new StoreIndex();
    index.upsert(note(A, join(REPO_ROOT, 'dir', 'a.md')));
    index.upsert(note(B, join(REPO_ROOT, 'dirx', 'b.md')));
    index.removeTree(join(REPO_ROOT, 'dir'), sep);
    expect(index.get(A)).toBeUndefined();
    expect(index.get(B)).toBeDefined();
  });
});

describe('readStoreFile', () => {
  it('takes the project from the front matter outside projects/ and reads project variables', () => {
    const text = `---\nid: ${A}\ntype: note\nrev: 1\nproject_id: ${B}\n---\n`;
    expect(readStoreFile({ root: 'repo', relative: `notes/${A}.md`, path: 'x' }, text)).toMatchObject({ kind: 'entity', entity: { projectId: B } });
    expect(readStoreFile({ root: 'repo', relative: `projects/${B}/vars/v.yaml`, path: 'y' }, 'name: v\ntype: string\nvalue: x\n')).toMatchObject({ kind: 'var', entry: { projectId: B, scope: 'repo' } });
    expect(readStoreFile({ root: 'global', relative: 'global/vars/v.yaml', path: 'z' }, 'name: v\ntype: string\nvalue: x\n')).toMatchObject({ kind: 'var', entry: { scope: 'global' } });
  });
});
