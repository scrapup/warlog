import { describe, expect, it } from '@jest/globals';
import { decodeCursor, encodeCursor } from '../../../../src/core/presenter/cursor-codec.ts';
import { projectFields } from '../../../../src/core/presenter/field-projector.ts';
import { Presenter } from '../../../../src/core/presenter/presenter.ts';
import { formatCell, formatTable } from '../../../../src/core/presenter/table-formatter.ts';

const presenter = new Presenter();
const ROWS = [
  { id: 'A', title: 'a | b', tags: ['x', 'y'], meta: { k: 1 }, done: true, body: 'long text' },
  { id: 'B', title: 'two\r\nlines', tags: [], meta: null, done: false },
];
const ENTITY = { kind: 'entity', record: { data: { id: 'X', type: 'note', rev: 1, title: 'T' }, body: 'Body\n' } } as const;

describe('Presenter', () => {
  it('[WL-38] renders lists as compact Markdown tables with escaped cells', () => {
    expect(presenter.present({ kind: 'list', rows: ROWS }, 'table')).toBe(
      ['| id | title | tags | meta | done | body |', '|---|---|---|---|---|---|', '| A | a \\| b | x, y | {"k":1} | true | long text |', '| B | two lines |  |  | false |  |'].join('\n'),
    );
  });

  it('[WL-38] adds the next cursor below a paginated table and says when there are no rows', () => {
    expect(presenter.present({ kind: 'list', rows: [{ id: 'A' }], nextCursor: 'c1' }, 'table')).toBe('| id |\n|---|\n| A |\n\nnext_cursor: c1');
    expect(presenter.present({ kind: 'list', rows: [] }, 'table')).toBe('(no rows)');
  });

  it('[WL-38] renders entities as front matter plus body', () => {
    expect(presenter.present(ENTITY, 'yaml')).toBe('---\nid: X\ntype: note\nrev: 1\ntitle: T\n---\nBody\n');
  });

  it('[WL-38] renders structured values as YAML and scalars raw', () => {
    expect(presenter.present({ kind: 'object', value: { a: 1, b: 'no' } }, 'yaml')).toBe('a: 1\nb: no');
    expect(presenter.present({ kind: 'scalar', value: false }, 'yaml')).toBe('false');
    expect(presenter.present({ kind: 'scalar', value: null }, 'yaml')).toBe('null');
    expect(presenter.present({ kind: 'scalar', value: '012' }, 'yaml')).toBe('012');
  });

  it('[WL-38] renders JSON on request for every kind', () => {
    expect(JSON.parse(presenter.present({ kind: 'list', rows: [{ id: 'A' }], nextCursor: 'c' }, 'table', { format: 'json' }))).toEqual({ rows: [{ id: 'A' }], next_cursor: 'c' });
    expect(JSON.parse(presenter.present({ kind: 'list', rows: [] }, 'table', { format: 'json' }))).toEqual({ rows: [] });
    expect(JSON.parse(presenter.present(ENTITY, 'yaml', { format: 'json' }))).toEqual({ id: 'X', type: 'note', rev: 1, title: 'T', body: 'Body\n' });
    expect(JSON.parse(presenter.present({ kind: 'scalar', value: 3 }, 'yaml', { format: 'json' }))).toBe(3);
  });

  it('[WL-38] selects fields on lists, entities and objects', () => {
    expect(presenter.present({ kind: 'list', rows: ROWS }, 'table', { fields: ['id', 'done'] })).toBe('| id | done |\n|---|---|\n| A | true |\n| B | false |');
    expect(presenter.present(ENTITY, 'yaml', { fields: ['id', 'title'] })).toBe('---\nid: X\ntitle: T\n---\n');
    expect(presenter.present(ENTITY, 'yaml', { fields: ['id', 'body'] })).toBe('---\nid: X\n---\nBody\n');
    expect(presenter.present({ kind: 'object', value: { a: 1, b: 2 } }, 'yaml', { fields: ['b'] })).toBe('b: 2');
    expect(presenter.present({ kind: 'scalar', value: 1 }, 'yaml', { fields: ['x'] })).toBe('1');
  });

  it('[WL-38] rejects unknown fields and a table for a non-list result', () => {
    expect(() => presenter.present({ kind: 'list', rows: ROWS }, 'table', { fields: ['nope'] })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    expect(() => presenter.present(ENTITY, 'yaml', { format: 'table' })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  it('falls back to YAML when the default table format meets a non-list result', () => {
    expect(presenter.present({ kind: 'object', value: { a: 1 } }, 'table')).toBe('a: 1');
  });
});

describe('presenter helpers', () => {
  it('formats cells', () => {
    expect([formatCell(undefined), formatCell(['a', null]), formatCell(2)]).toEqual(['', 'a, ', '2']);
    expect(formatTable([{ a: 1 }, { b: 2 }])).toBe('| a | b |\n|---|---|\n| 1 |  |\n|  | 2 |');
  });

  it('projects fields, keeping all when none is requested and tolerating empty lists', () => {
    expect(projectFields([{ a: 1 }], [])).toEqual([{ a: 1 }]);
    expect(projectFields([], ['a'])).toEqual([]);
  });

  it('[WL-38] round-trips cursors and rejects malformed ones', () => {
    const cursor = { key: '2026-10-03T00:00:00.000Z', id: '01J00000000000000000000001' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    for (const bad of ['', 'not-base64!', Buffer.from('{"a":1}').toString('base64url'), Buffer.from('[1,2]').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    }
  });
});
