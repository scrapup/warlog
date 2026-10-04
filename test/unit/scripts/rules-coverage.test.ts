import { describe, expect, it } from '@jest/globals';
import { checkCoverage, parseAllowList, renderReport } from '../../../scripts/rules-coverage/coverage-check.ts';
import type { RulesFileSystem } from '../../../scripts/rules-coverage/file-system.ts';
import { MalformedReportError, parseJestReport } from '../../../scripts/rules-coverage/jest-report.ts';
import {
  extractSpecRuleIds,
  extractTitleRuleIds,
  isCodeLevel,
  parseRuleId,
} from '../../../scripts/rules-coverage/rule-ids.ts';
import { parseArgs, runRulesCoverage } from '../../../scripts/rules-coverage/runner.ts';

const SPEC = [
  '# Spec',
  '| # | Rule | Type |',
  '|---|---|---|',
  '| WL-01 | Files | Mandatory |',
  '| WL-02 | Scopes | Mandatory |',
  '| WL-50 | Repository | Mandatory |',
  '| SEC-21 | Linear | Mandatory |',
  '| SEC-01 | Branch | Restrictive |',
  '| Not-a-rule | x | y |',
  'WL-03 outside a table',
].join('\n');

/**
 * Builds a Jest JSON report with the given assertions.
 * @param assertions - Assertion results.
 * @returns Report text.
 */
function report(assertions: Array<{ title: string; status: string; fullName?: string }>): string {
  return JSON.stringify({ testResults: [{ assertionResults: assertions }] });
}

/**
 * In-memory file system for the runner.
 * @param files - Initial files by path.
 * @returns The fake and the map holding written files.
 */
function memoryFs(files: Record<string, string>): { fs: RulesFileSystem; store: Map<string, string> } {
  const store = new Map(Object.entries(files));
  const fs: RulesFileSystem = {
    readText: async (path) => {
      const content = store.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT ${path}`);
      }
      return content;
    },
    writeText: async (path, content) => {
      store.set(path, content);
    },
    listDir: async (path) =>
      [...store.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => k.slice(path.length + 1)),
  };
  return { fs, store };
}

describe('rule ids', () => {
  it('parses well-formed identifiers and rejects malformed ones', () => {
    expect(parseRuleId('WL-07')).toEqual({ prefix: 'WL', number: 7 });
    expect(parseRuleId('SEC-21')).toEqual({ prefix: 'SEC', number: 21 });
    for (const bad of ['', 'WL', '-1', 'WL-', 'wl-1', 'WL-1a', 'W1-2', 'WL-123456789012345']) {
      expect(parseRuleId(bad)).toBeUndefined();
    }
  });

  it('classifies code-level ranges', () => {
    expect(['WL-01', 'WL-49', 'WL-57', 'WL-75', 'SEC-21', 'SEC-24'].every(isCodeLevel)).toBe(true);
    expect(['WL-50', 'WL-56', 'WL-76', 'SEC-20', 'SEC-25', 'P-03', 'bogus'].some(isCodeLevel)).toBe(false);
  });

  it('extracts rule ids from spec tables only', () => {
    expect(extractSpecRuleIds(`${SPEC}\n| WL-01 | duplicate | x |`)).toEqual(['WL-01', 'WL-02', 'WL-50', 'SEC-21', 'SEC-01']);
  });

  it('reads a first cell without a closing pipe', () => {
    expect(extractSpecRuleIds('| WL-04')).toEqual(['WL-04']);
  });

  it('extracts leading bracket groups from test titles', () => {
    expect(extractTitleRuleIds('[WL-42][WL-41] rejects a stale rev')).toEqual(['WL-42', 'WL-41']);
    expect(extractTitleRuleIds('  [WL-01] [note] [WL-02] x')).toEqual(['WL-01', 'WL-02']);
    expect(extractTitleRuleIds('[WL-01 unterminated')).toEqual([]);
    expect(extractTitleRuleIds('no rule [WL-01]')).toEqual([]);
  });
});

describe('jest report parsing', () => {
  it('returns proofs of passing tests only, using fullName when present', () => {
    const proofs = parseJestReport(
      'unit.json',
      report([
        { title: '[WL-01] a', status: 'passed', fullName: 'suite [WL-01] a' },
        { title: '[WL-02] b', status: 'failed' },
        { title: '[SEC-21] c', status: 'passed' },
      ]),
    );
    expect(proofs).toEqual([
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
    expect(() => parseJestReport('bad.json', text)).toThrow(new MalformedReportError('bad.json', reason));
  });

  it('records the offending file on the error', () => {
    try {
      parseJestReport('bad.json', '[]');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(MalformedReportError);
      expect((error as MalformedReportError).file).toBe('bad.json');
    }
    expect.assertions(2);
  });
});

describe('coverage check', () => {
  it('parses the allow list ignoring comments and blanks', () => {
    expect([...parseAllowList('# header\nWL-01\n\n  WL-02  # owned by US-94\n')]).toEqual(['WL-01', 'WL-02']);
  });

  it('separates proven, pending and missing code-level rules', () => {
    const result = checkCoverage(
      ['WL-01', 'WL-02', 'WL-50', 'SEC-21'],
      [
        { rule: 'WL-01', test: 't1' },
        { rule: 'WL-50', test: 'ignored, not code-level' },
      ],
      new Set(['WL-02']),
    );
    expect(result.rules).toEqual(['WL-01', 'WL-02', 'SEC-21']);
    expect(result.entries[0]).toEqual({ rule: 'WL-01', tests: ['t1'] });
    expect(result.pending).toEqual(['WL-02']);
    expect(result.missing).toEqual(['SEC-21']);
  });

  it('renders the evidence table with escaped cells', () => {
    const result = checkCoverage(['WL-01', 'WL-02', 'SEC-21'], [{ rule: 'WL-01', test: 'a | b\nc' }], new Set(['WL-02']));
    const md = renderReport(result);
    expect(md).toContain('Proven: **1/3** · pending (allow-list): 1 · missing: 1');
    expect(md).toContain('| WL-01 | proven | a \\| b c |');
    expect(md).toContain('| WL-02 | pending |  |');
    expect(md).toContain('| SEC-21 | missing |  |');
  });
});

describe('runner', () => {
  it('parses arguments with defaults and rejects unknown flags', () => {
    expect(parseArgs([])).toEqual({
      specPath: 'docs/specs/warlog/spec.md',
      reportsDir: 'reports',
      outPath: 'docs/evidence/rules-coverage.md',
    });
    expect(parseArgs(['--spec', 's.md', '--reports', 'r', '--out', 'o.md', '--allow-missing', 'a.txt'])).toEqual({
      specPath: 's.md',
      reportsDir: 'r',
      outPath: 'o.md',
      allowMissingPath: 'a.txt',
    });
    expect(() => parseArgs(['--nope', 'x'])).toThrow('invalid argument: --nope');
    expect(() => parseArgs(['--spec'])).toThrow('invalid argument: --spec');
  });

  it('exits 0 and writes the evidence when every rule is proven or pending', async () => {
    const { fs, store } = memoryFs({
      'spec.md': SPEC,
      'r/unit.json': report([{ title: '[WL-01] a', status: 'passed' }]),
      'r/notes.txt': 'ignored',
      'allow.txt': 'WL-02\nSEC-21\n',
    });
    const outcome = await runRulesCoverage(
      { specPath: 'spec.md', reportsDir: 'r', outPath: 'out.md', allowMissingPath: 'allow.txt' },
      fs,
    );
    expect(outcome).toEqual({ exitCode: 0, message: 'rules proven 1/3, pending 2' });
    expect(store.get('out.md')).toContain('| WL-01 | proven | [WL-01] a |');
  });

  it('exits 1 listing unproven rules', async () => {
    const { fs } = memoryFs({ 'spec.md': SPEC, 'r/unit.json': report([]) });
    const outcome = await runRulesCoverage({ specPath: 'spec.md', reportsDir: 'r', outPath: 'out.md' }, fs);
    expect(outcome).toEqual({ exitCode: 1, message: 'rules proven 0/3, pending 0; unproven: WL-01, WL-02, SEC-21' });
  });

  it('exits 1 naming a malformed report', async () => {
    const { fs } = memoryFs({ 'spec.md': SPEC, 'r/bad.json': 'not json' });
    const outcome = await runRulesCoverage({ specPath: 'spec.md', reportsDir: 'r', outPath: 'out.md' }, fs);
    expect(outcome).toEqual({ exitCode: 1, message: 'rules-coverage failed: malformed Jest report bad.json: invalid JSON' });
  });

  it('exits 1 when no report exists', async () => {
    const { fs } = memoryFs({ 'spec.md': SPEC });
    const outcome = await runRulesCoverage({ specPath: 'spec.md', reportsDir: 'r', outPath: 'out.md' }, fs);
    expect(outcome).toEqual({ exitCode: 1, message: 'rules-coverage failed: no Jest JSON report in r' });
  });

  it('exits 1 on a non-Error failure', async () => {
    const { fs } = memoryFs({});
    const failing: RulesFileSystem = {
      ...fs,
      readText: async () => {
        throw 'boom';
      },
    };
    const outcome = await runRulesCoverage({ specPath: 'spec.md', reportsDir: 'r', outPath: 'out.md' }, failing);
    expect(outcome).toEqual({ exitCode: 1, message: 'rules-coverage failed: boom' });
  });
});
