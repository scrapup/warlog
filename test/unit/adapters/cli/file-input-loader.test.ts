import { describe, expect, it } from '@jest/globals';
import { parseFileInput } from '../../../../src/adapters/cli/file-input-loader.ts';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';

/**
 * Captures the error thrown by a call.
 * @param fn - Call.
 * @returns The error.
 */
function errorOf(fn: () => unknown): WarlogError {
  try {
    fn();
  } catch (error: unknown) {
    return error as WarlogError;
  }
  throw new Error('expected an error');
}

describe('file input loader', () => {
  it('[WL-36] reads Markdown front matter as fields and the body into the body key', () => {
    const input = parseFileInput('---\r\ntitle: T\r\n---\r\nBody\r\n', 'n.MD', 'content');
    expect(input.data).toEqual({ title: 'T', content: 'Body\n' });
    expect(input.locate(['title'])).toEqual({ line: 2, col: 8 });
  });

  it('[WL-36] omits an empty Markdown body and a body after a closing marker at end of file', () => {
    expect(parseFileInput('---\ntitle: T\n---', 'n.md', 'description').data).toEqual({ title: 'T' });
    expect(parseFileInput('---\ntitle: T\n---\n', 'n.md', 'description').data).toEqual({ title: 'T' });
  });

  it('[WL-36] reads Markdown saved with a byte order mark, as some Windows editors do', () => {
    const input = parseFileInput('\uFEFF---\ntitle: T\n---\nBody\n', 'n.md', 'content');
    expect(input.data).toEqual({ title: 'T', content: 'Body\n' });
  });

  it('[WL-36] rejects Markdown without front matter', () => {
    expect(errorOf(() => parseFileInput('# Title\n', 'n.md', 'description'))).toMatchObject({ code: 'VALIDATION', details: { file: 'n.md', line: 1, col: 1 } });
    expect(errorOf(() => parseFileInput('---\ntitle: T\n', 'n.md', 'description')).message).toBe('n.md:1:1 missing front matter');
  });

  it('[WL-36] offsets front-matter error lines by the opening marker', () => {
    expect(errorOf(() => parseFileInput('---\ntitle: [\n---\n', 'n.md', 'description')).details).toMatchObject({ file: 'n.md', line: 3 });
  });

  it.each([['- a\n'], ['just text\n'], ['42\n']])('[WL-36] rejects a document that is not a mapping: %j', (text) => {
    expect(errorOf(() => parseFileInput(text, 'in.yaml', 'description'))).toMatchObject({ code: 'VALIDATION', message: 'in.yaml:1:1 the file must contain a mapping of fields' });
  });

  it('[WL-36] treats an empty file as no fields and reports unknown paths as unlocated', () => {
    const input = parseFileInput('', '-', 'description');
    expect(input.data).toEqual({});
    expect(input.locate(['x'])).toBeUndefined();
  });

  it('[WL-36] rejects alias bombs', () => {
    const bomb = ['a: &a [x, x]', ...Array.from({ length: 12 }, (_, i) => `l${i}: &l${i} [${i === 0 ? '*a' : `*l${i - 1}`}, ${i === 0 ? '*a' : `*l${i - 1}`}]`)].join('\n');
    expect(errorOf(() => parseFileInput(bomb, 'b.yaml', 'description'))).toMatchObject({ code: 'VALIDATION', details: { file: 'b.yaml', line: 1, col: 1 } });
  });
});
