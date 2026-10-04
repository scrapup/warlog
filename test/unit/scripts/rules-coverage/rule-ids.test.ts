import { describe, expect, it } from '@jest/globals';
import {
  describeCodeLevelRanges,
  expectedCodeLevelIds,
  extractSpecRuleIds,
  extractTitleRuleIds,
  isCodeLevel,
  parseRuleId,
} from '../../../../scripts/rules-coverage/rule-ids.ts';

describe('parseRuleId', () => {
  it.each([
    ['WL-07', { prefix: 'WL', number: 7 }],
    ['SEC-21', { prefix: 'SEC', number: 21 }],
  ])('parses %s', (text, expected) => {
    expect(parseRuleId(text)).toEqual(expected);
  });

  it.each(['', 'WL', '-1', 'WL-', 'wl-1', 'WL-1a', 'W1-2', 'WL-123456789012345'])('rejects %p', (text) => {
    expect(parseRuleId(text)).toBeUndefined();
  });
});

describe('code-level ranges', () => {
  it.each(['WL-01', 'WL-49', 'WL-57', 'WL-75', 'SEC-21', 'SEC-24'])('%s is code-level', (id) => {
    expect(isCodeLevel(id)).toBe(true);
  });

  it.each(['WL-50', 'WL-56', 'WL-76', 'SEC-20', 'SEC-25', 'P-03', 'bogus'])('%s is not code-level', (id) => {
    expect(isCodeLevel(id)).toBe(false);
  });

  it('describes the ranges', () => {
    expect(describeCodeLevelRanges()).toBe('WL-01..WL-49, WL-57..WL-75, SEC-21..SEC-24');
  });

  it('lists every expected identifier', () => {
    const ids = expectedCodeLevelIds();
    expect(ids).toHaveLength(49 + 19 + 4);
    expect(ids.slice(0, 2)).toEqual(['WL-01', 'WL-02']);
    expect(ids.slice(-1)).toEqual(['SEC-24']);
  });
});

describe('extractSpecRuleIds', () => {
  it('reads first cells of table rows only, without duplicates', () => {
    const spec = ['| # | Rule |', '|---|---|', '| WL-01 | a |', '| SEC-21 | b |', '| WL-01 | dup |', '| Not-a-rule | x |', 'WL-03 text'];
    expect(extractSpecRuleIds(spec.join('\n'))).toEqual(['WL-01', 'SEC-21']);
  });

  it('reads a first cell without a closing pipe', () => {
    expect(extractSpecRuleIds('| WL-04')).toEqual(['WL-04']);
  });
});

describe('extractTitleRuleIds', () => {
  it.each([
    ['[WL-42][WL-41] rejects a stale rev', ['WL-42', 'WL-41']],
    ['  [WL-01] [note] [WL-02] x', ['WL-01', 'WL-02']],
    ['[WL-01 unterminated', []],
    ['no rule [WL-01]', []],
  ])('%p yields %p', (title, expected) => {
    expect(extractTitleRuleIds(title)).toEqual(expected);
  });
});
