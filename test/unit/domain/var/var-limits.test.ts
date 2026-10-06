import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import { failure } from '../../../support/tracker-setup.ts';

describe('variable files', () => {
  it('[WL-25] a value that would make the file larger than 2 MiB is refused and the variable stays readable, replaceable and deletable', async () => {
    const h = trackerHarness();
    await h.call('var_set', { name: 'big', value: { small: 1 }, scope: 'global' });
    const huge = Object.fromEntries(Array.from({ length: 70_000 }, (_, i) => [`key${i}`, 'x'.repeat(30)]));
    expect(await failure(h.call('var_set', { name: 'big', value: huge, scope: 'global' }))).toMatchObject({ code: 'VALIDATION', details: { reason: 'too_large' } });
    expect(await h.obj('var_get', { name: 'big' })).toMatchObject({ value: { small: 1 } });
    await h.call('var_set', { name: 'big', value: { small: 2 }, scope: 'global' });
    await h.call('var_delete', { name: 'big', scope: 'global' });
  });

  it.each([['null', 'deleted_at: null\n'], ['false', 'deleted_at: false\n'], ['a number', 'deleted_at: 5\n']])('[WL-45] a hand-edited deletion mark that is %s is an invalid file, not a deleted variable', async (_name, mark) => {
    const h = trackerHarness();
    await h.call('var_set', { name: 'flag', value: true, scope: 'global' });
    const file = join(h.roots.global, 'global', 'vars', 'flag.yaml');
    h.fs.files.set(file, `${h.fs.files.get(file) ?? ''}${mark}`);
    expect(await failure(h.call('var_get', { name: 'flag' }))).toMatchObject({ code: 'INVALID_FILE', details: { reason: 'var_fields' } });
  });

  it('[WL-25] a file without updated_at and machine is read with empty values, never a wrongly typed record', async () => {
    const h = trackerHarness();
    h.fs.files.set(join(h.roots.global, 'global', 'vars', 'hand.yaml'), 'name: hand\ntype: string\nvalue: x\nrev: 1\n');
    expect(await h.obj('var_get', { name: 'hand' })).toEqual({ value: 'x', type: 'string', scope: 'global' });
    await h.call('var_set', { name: 'hand', value: 'y', scope: 'global' });
    expect(h.fs.files.get(join(h.roots.global, 'global', 'vars', 'hand.yaml'))).toContain('machine:');
  });
});
