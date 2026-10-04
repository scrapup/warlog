import { describe, expect, it } from '@jest/globals';
import { errorFields } from '../../../../src/core/errors/error-fields.ts';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';

describe('errorFields', () => {
  it.each([
    [new WarlogError('NOT_FOUND', '/home/alice/x not found'), { error_code: 'NOT_FOUND', error_name: 'WarlogError' }],
    [Object.assign(new Error('EACCES: /home/alice/.warlog'), { code: 'EACCES' }), { error_code: 'UNEXPECTED', error_name: 'Error', sys_code: 'EACCES' }],
    [new TypeError('boom'), { error_code: 'UNEXPECTED', error_name: 'TypeError' }],
    ['text', { error_code: 'UNEXPECTED', error_name: 'string' }],
  ])('projects %p without messages or paths', (error, expected) => {
    const fields = errorFields(error);
    expect(fields).toEqual(expected);
    expect(JSON.stringify(fields)).not.toContain('alice');
  });
});
