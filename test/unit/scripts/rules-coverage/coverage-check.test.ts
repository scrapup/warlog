import { describe, expect, it } from '@jest/globals';
import { checkCoverage, parseAllowList, renderReport } from '../../../../scripts/rules-coverage/coverage-check.ts';
import { expectedCodeLevelIds } from '../../../../scripts/rules-coverage/rule-ids.ts';

describe('parseAllowList', () => {
  it('ignores comments and blank lines', () => {
    expect([...parseAllowList('# header\nWL-01\n\n  WL-02  # owned by US-94\n')]).toEqual(['WL-01', 'WL-02']);
  });
});

describe('checkCoverage', () => {
  it('separates proven, pending and missing code-level rules', () => {
    const result = checkCoverage(
      ['WL-01', 'WL-02', 'WL-50', 'SEC-21'],
      [
        { rule: 'WL-01', test: 't1' },
        { rule: 'WL-01', test: 't2' },
        { rule: 'WL-50', test: 'not code-level' },
      ],
      new Set(['WL-02']),
    );
    expect(result.rules).toEqual(['WL-01', 'WL-02', 'SEC-21']);
    expect(result.entries[0]).toEqual({ rule: 'WL-01', tests: ['t1', 't2'] });
    expect(result.proven).toBe(1);
    expect(result.pending).toEqual(['WL-02']);
    expect(result.missing).toEqual(['SEC-21']);
  });

  it('lists the code-level identifiers absent from the specification', () => {
    const result = checkCoverage(expectedCodeLevelIds().filter((id) => id !== 'WL-07'), [], new Set());
    expect(result.absentFromSpec).toEqual(['WL-07']);
  });
});

describe('renderReport', () => {
  it('renders the summary and an escaped row per rule', () => {
    const result = checkCoverage(['WL-01', 'WL-02', 'SEC-21'], [{ rule: 'WL-01', test: 'a | b\nc' }], new Set(['WL-02']));
    const md = renderReport(result, 'spec.md');
    expect(md).toContain('Code-level rules of `spec.md`');
    expect(md).toContain('(WL-01..WL-49, WL-57..WL-75, SEC-21..SEC-24)');
    expect(md).toContain('Proven: **1/3** · pending (allow-list): 1 · missing: 1');
    expect(md).toContain('| WL-01 | proven | a \\| b c |');
    expect(md).toContain('| WL-02 | pending |  |');
    expect(md).toContain('| SEC-21 | missing |  |');
  });
});
