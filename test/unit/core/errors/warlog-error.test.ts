import { describe, expect, it } from '@jest/globals';
import { WarlogError, isWarlogError } from '../../../../src/core/errors/warlog-error.ts';

describe('WarlogError', () => {
  it('carries a code, details and cause', () => {
    const cause = new Error('io');
    const error = new WarlogError('CONFLICT', 'stale', { current: { rev: 2 } }, { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WarlogError');
    expect(error.code).toBe('CONFLICT');
    expect(error.details).toEqual({ current: { rev: 2 } });
    expect(error.cause).toBe(cause);
  });

  it('is recognized by code', () => {
    const error = new WarlogError('NOT_FOUND', 'missing');
    expect(isWarlogError(error, 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(error, 'CONFLICT')).toBe(false);
    expect(isWarlogError(new Error('x'), 'NOT_FOUND')).toBe(false);
  });
});
