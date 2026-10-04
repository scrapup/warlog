import { describe, expect, it } from '@jest/globals';
import { compareCodeUnits } from '../../../../src/core/security/compare.ts';

describe('compareCodeUnits', () => {
  it('[WL-05] orders by code unit, independently of the locale', () => {
    expect(['b', 'B', 'a', 'é', '_', 'a'].sort(compareCodeUnits)).toEqual(['B', '_', 'a', 'a', 'b', 'é']);
  });
});
