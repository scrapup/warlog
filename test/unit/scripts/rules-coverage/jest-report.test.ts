import { describe, expect, it } from '@jest/globals';
import { MalformedReportError, parseJestReport } from '../../../../scripts/rules-coverage/jest-report.ts';

describe('parseJestReport', () => {
  it('returns proofs of passing tests only, using fullName when present', () => {
    const report = JSON.stringify({
      testResults: [
        {
          assertionResults: [
            { title: '[WL-01] a', status: 'passed', fullName: 'suite [WL-01] a' },
            { title: '[WL-02] b', status: 'failed' },
            { title: '[SEC-21] c', status: 'passed' },
          ],
        },
      ],
    });
    expect(parseJestReport('unit.json', report)).toEqual([
      { rule: 'WL-01', test: 'suite [WL-01] a' },
      { rule: 'SEC-21', test: '[SEC-21] c' },
    ]);
  });

  it.each([
    ['invalid JSON', '{'],
    ['missing testResults[]', '{}'],
    ['testResults[] without assertionResults[]', '{"testResults":[{}]}'],
    ['assertion without string title/status', '{"testResults":[{"assertionResults":[{"title":1}]}]}'],
  ])('fails closed on %s', (reason, text) => {
    expect(() => parseJestReport('bad.json', text)).toThrow(`malformed Jest report bad.json: ${reason}`);
  });

  it('records the offending file and the parse error cause', () => {
    const act = (): unknown => {
      try {
        parseJestReport('bad.json', '{');
      } catch (error: unknown) {
        return error;
      }
      return undefined;
    };
    const error = act();
    expect(error).toBeInstanceOf(MalformedReportError);
    expect((error as MalformedReportError).file).toBe('bad.json');
    expect((error as MalformedReportError).cause).toBeInstanceOf(SyntaxError);
  });
});
