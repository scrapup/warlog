import { describe, expect, it } from '@jest/globals';
import { MAX_SECRET_SCAN_DEPTH, SecretGuard } from '../../../../src/core/security/secret-guard.ts';
import { ADVERSARIAL_LENGTH, LINEAR_RATIO_LIMIT, scalingRatio } from '../../../support/timing.ts';

/** Secret samples assembled at run time so no secret-looking literal is committed. */
const SAMPLES: ReadonlyArray<readonly [string, string]> = [
  ['github-token', ['gh', 'p_'].join('') + 'a1B2'.repeat(9)],
  ['github-token', ['gh', 's_'].join('') + 'Z9'.repeat(18)],
  ['github-pat', ['github', '_pat_'].join('') + 'A_1'.repeat(27) + 'x'],
  ['npm-token', ['np', 'm_'].join('') + 'q7'.repeat(18)],
  ['api-key', ['s', 'k-'].join('') + 'proj-' + 'Ab9_'.repeat(5)],
  ['slack-token', ['xo', 'xb-'].join('') + '1234-5678-abcd'],
  ['aws-access-key', ['AK', 'IA'].join('') + 'ABCD1234EFGH5678'],
  ['private-key', ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('') + '\nMIIE...'],
];

describe('SecretGuard', () => {
  it.each(SAMPLES)('[WL-09] detects %s', (kind, secret) => {
    expect(new SecretGuard().scan(`prefix ${secret} suffix`)).toEqual([{ kind, path: '$' }]);
  });

  it.each([
    ['plain text', 'deploy with npm run build'],
    ['short token-like', `${['gh', 'p_'].join('')}short`],
    ['glued prefix (not a boundary)', `task-management-${'x'.repeat(30)}`],
    ['kebab word containing sk-', `ask-${'a'.repeat(40)}`],
    ['public key header', '-----BEGIN PUBLIC KEY-----'],
    ['unterminated header', '-----BEGIN RSA PRIVATE KEY'],
    ['lower-case aws', `akia${'a'.repeat(16)}`],
  ])('[WL-09] ignores %s', (_label, text) => {
    expect(new SecretGuard().scan(text)).toEqual([]);
  });

  it('[WL-09] walks nested objects, arrays and keys and never reports the secret itself', () => {
    const secret = SAMPLES[0]?.[1] ?? '';
    const findings = new SecretGuard().scan({ a: [1, true, null, { b: secret }], [secret]: { nested: secret } });
    expect(findings).toEqual([
      { kind: 'github-token', path: '$.a[3].b' },
      { kind: 'github-token', path: '$.<key#1>' },
      { kind: 'github-token', path: '$.<key#1>.nested' },
    ]);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  it('[WL-09] rejects with SECRET_REJECTED whose details never contain the secret', () => {
    const guard = new SecretGuard();
    const secret = SAMPLES[6]?.[1] ?? '';
    const act = (): unknown => {
      try {
        guard.assertClean({ note: secret, [secret]: 1 });
      } catch (error: unknown) {
        return error;
      }
      return undefined;
    };
    const error = act();
    expect(error).toMatchObject({ code: 'SECRET_REJECTED' });
    expect(JSON.stringify((error as { details: unknown }).details)).not.toContain(secret);
  });

  it('[WL-09] accepts clean values', () => {
    expect(() => new SecretGuard().assertClean({ note: 'clean' })).not.toThrow();
  });

  it(`[SEC-23] fails closed beyond ${MAX_SECRET_SCAN_DEPTH} levels of nesting`, () => {
    let value: unknown = 'leaf';
    for (let i = 0; i < MAX_SECRET_SCAN_DEPTH + 1; i += 1) {
      value = [value];
    }
    expect(() => new SecretGuard().scan(value)).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  it.each([
    ['runs of a', 'a'.repeat(ADVERSARIAL_LENGTH)],
    ['repeated partial prefixes', ['gh', 'p_'].join('').repeat(ADVERSARIAL_LENGTH / 4)],
    ['prefix plus 35 chars repeated', `${['gh', 'p_'].join('')}${'a'.repeat(35)} `.repeat(ADVERSARIAL_LENGTH / 40)],
    ['dashes after sk-', `${['s', 'k-'].join('')}${'-'.repeat(ADVERSARIAL_LENGTH)}`],
    ['repeated sk- prefixes', ['s', 'k-'].join('').repeat(ADVERSARIAL_LENGTH / 3)],
    ['underscores', '_'.repeat(ADVERSARIAL_LENGTH)],
    ['repeated BEGIN headers', '-----BEGIN '.repeat(ADVERSARIAL_LENGTH / 11)],
  ])('[WL-48] terminates on pathological input (%s); time budget in integration', (_label, text) => {
    expect(text.length).toBeGreaterThanOrEqual(ADVERSARIAL_LENGTH - 40);
    expect(Array.isArray(new SecretGuard().scan(text))).toBe(true);
  });

  it('[SEC-22][SEC-21] scales linearly (4× the input stays well below 16× the time)', () => {
    const ratio = scalingRatio((n) => ['s', 'k-'].join('').repeat(n), (text) => new SecretGuard().scan(text), ADVERSARIAL_LENGTH);
    expect(ratio).toBeLessThan(LINEAR_RATIO_LIMIT);
  });
});
