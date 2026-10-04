import { describe, expect, it } from '@jest/globals';
import type { RulesFileSystem } from '../../../../scripts/rules-coverage/file-system.ts';
import { expectedCodeLevelIds } from '../../../../scripts/rules-coverage/rule-ids.ts';
import { parseArgs, runFromArgs, runRulesCoverage } from '../../../../scripts/rules-coverage/runner.ts';

/** Specification declaring every code-level rule. */
const FULL_SPEC = expectedCodeLevelIds()
  .map((id) => `| ${id} | rule | Mandatory |`)
  .join('\n');

/** Allow list tolerating every code-level rule except WL-01. */
const ALLOW_ALL_BUT_WL01 = expectedCodeLevelIds()
  .filter((id) => id !== 'WL-01')
  .join('\n');

/**
 * Builds a Jest JSON report with the given assertions.
 * @param assertions - Assertion results.
 * @returns Report text.
 */
function report(assertions: Array<{ title: string; status: string }>): string {
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
    listDir: async (path) => [...store.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => k.slice(path.length + 1)),
  };
  return { fs, store };
}

const OPTIONS = { specPath: 'spec.md', reportsDir: 'r', outPath: 'out.md' };

describe('parseArgs', () => {
  it('applies defaults', () => {
    expect(parseArgs([])).toEqual({ specPath: 'docs/specs/warlog/spec.md', reportsDir: 'reports', outPath: 'docs/evidence/rules-coverage.md' });
  });

  it('reads every flag', () => {
    expect(parseArgs(['--spec', 's.md', '--reports', 'r', '--out', 'o.md', '--allow-missing', 'a.txt'])).toEqual({
      specPath: 's.md',
      reportsDir: 'r',
      outPath: 'o.md',
      allowMissingPath: 'a.txt',
    });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--nope', 'x'])).toThrow('invalid argument: --nope');
  });

  it('rejects a flag without value', () => {
    expect(() => parseArgs(['--spec'])).toThrow('invalid argument: --spec');
  });
});

describe('runRulesCoverage', () => {
  it('exits 0 and writes the evidence when every rule is proven or pending', async () => {
    const { fs, store } = memoryFs({
      'spec.md': FULL_SPEC,
      'r/unit.json': report([{ title: '[WL-01] a', status: 'passed' }]),
      'r/notes.txt': 'ignored',
      'allow.txt': ALLOW_ALL_BUT_WL01,
    });
    const outcome = await runRulesCoverage({ ...OPTIONS, allowMissingPath: 'allow.txt' }, fs);
    expect(outcome).toEqual({ exitCode: 0, message: 'rules proven 1/72, pending 71' });
    expect(store.get('out.md')).toContain('| WL-01 | proven | [WL-01] a |');
  });

  it('exits 1 listing unproven rules', async () => {
    const { fs } = memoryFs({ 'spec.md': FULL_SPEC, 'r/unit.json': report([]), 'allow.txt': ALLOW_ALL_BUT_WL01 });
    const outcome = await runRulesCoverage({ ...OPTIONS, allowMissingPath: 'allow.txt' }, fs);
    expect(outcome).toEqual({ exitCode: 1, message: 'rules proven 0/72, pending 71; unproven: WL-01' });
  });

  it('fails closed when the specification lacks code-level rules', async () => {
    const { fs } = memoryFs({ 'spec.md': '# not a spec', 'r/unit.json': report([]) });
    const outcome = await runRulesCoverage(OPTIONS, fs);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.message).toMatch(/^rules-coverage failed: spec\.md lacks code-level rules WL-01, WL-02, /);
  });

  it('exits 1 naming a malformed report', async () => {
    const { fs } = memoryFs({ 'spec.md': FULL_SPEC, 'r/bad.json': 'not json' });
    const outcome = await runRulesCoverage(OPTIONS, fs);
    expect(outcome).toEqual({ exitCode: 1, message: 'rules-coverage failed: malformed Jest report bad.json: invalid JSON' });
  });

  it('exits 1 when no report exists', async () => {
    const { fs } = memoryFs({ 'spec.md': FULL_SPEC });
    const outcome = await runRulesCoverage(OPTIONS, fs);
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
    expect(await runRulesCoverage(OPTIONS, failing)).toEqual({ exitCode: 1, message: 'rules-coverage failed: boom' });
  });
});

describe('runFromArgs', () => {
  it('reports invalid arguments as an outcome instead of throwing', async () => {
    const { fs } = memoryFs({});
    expect(await runFromArgs(['--nope', 'x'], fs)).toEqual({ exitCode: 1, message: 'rules-coverage failed: invalid argument: --nope' });
  });

  it('runs the check with parsed arguments', async () => {
    const { fs } = memoryFs({ 'spec.md': FULL_SPEC });
    expect(await runFromArgs(['--spec', 'spec.md', '--reports', 'r'], fs)).toEqual({
      exitCode: 1,
      message: 'rules-coverage failed: no Jest JSON report in r',
    });
  });
});
