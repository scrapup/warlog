import { describe, expect, it } from '@jest/globals';
import { redactError, redactText, redactValue } from '../../../../src/core/errors/path-redactor.ts';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';

const REDACTIONS = [['/home/alice', '~'], ['/home/alice/.warlog', '<global>'], ['', 'ignored']] as const;

describe('path redaction', () => {
  it('replaces the longest prefixes first', () => {
    expect(redactText('/home/alice/.warlog/x and /home/alice/y', REDACTIONS)).toBe('<global>/x and ~/y');
  });

  it('redacts nested values and keeps non-strings', () => {
    expect(redactValue({ a: ['/home/alice/z', 1, null], b: { c: true } }, REDACTIONS)).toEqual({ a: ['~/z', 1, null], b: { c: true } });
  });

  it('keeps the code and cause of an error', () => {
    const cause = new Error('io');
    const redacted = redactError(new WarlogError('NOT_FOUND', '/home/alice/x missing', { file: '/home/alice/x' }, { cause }), REDACTIONS);
    expect(redacted).toMatchObject({ code: 'NOT_FOUND', message: '~/x missing', details: { file: '~/x' } });
    expect(redacted.cause).toBe(cause);
    expect(redactError(new WarlogError('INTERNAL', 'x'), REDACTIONS).details).toBeUndefined();
  });
});
