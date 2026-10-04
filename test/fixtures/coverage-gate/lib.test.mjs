import { expect, it } from '@jest/globals';
import { total } from './lib.mjs';

it('covers the main path', () => {
  expect(total(false)).toBe(120);
  if (process.env.COVER_ALL === '1') {
    expect(total(true)).toBe(220);
  }
});
