import { describe, expect, it } from '@jest/globals';
import { executeOperation, formatError } from '../../../../src/adapters/shared/execute-operation.ts';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { Presenter } from '../../../../src/core/presenter/presenter.ts';
import { fixtureDeps } from '../../../support/fixture-deps.ts';

/** A presenter that fails unexpectedly. */
class BrokenPresenter extends Presenter {
  /**
   * Always fails.
   * @returns Never.
   * @throws {TypeError} Always.
   */
  override present(): string {
    throw new TypeError('broken');
  }
}

describe('shared call path', () => {
  it('[WL-40] maps an unexpected rendering failure to INTERNAL', async () => {
    const outcome = await executeOperation({ ...fixtureDeps(), presenter: new BrokenPresenter() }, 'fixture_echo', { text: 'x' });
    expect(outcome).toMatchObject({ ok: false, error: { code: 'INTERNAL', message: 'internal error' } });
  });

  it('[WL-36] returns valid on a dry run and runs no handler', async () => {
    expect(await executeOperation(fixtureDeps(), 'fixture_echo', { text: 'x' }, { dryRun: true })).toEqual({ ok: true, text: 'valid', warnings: [] });
  });

  it('formats errors with and without details', () => {
    expect(formatError(new WarlogError('NOT_FOUND', 'gone'))).toBe('NOT_FOUND: gone');
    expect(formatError(new WarlogError('CONFLICT', 'stale', { rev: 2 }))).toBe('CONFLICT: stale\nrev: 2');
  });
});
