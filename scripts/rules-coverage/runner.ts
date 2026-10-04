/**
 * Orchestration of the rules-coverage check (plan §7.4): reads the specification and the
 * Jest JSON reports through an injected file system, writes the evidence file and returns
 * the exit code.
 */
import { checkCoverage, parseAllowList, renderReport } from './coverage-check.ts';
import type { RulesFileSystem } from './file-system.ts';
import { MalformedReportError, parseJestReport } from './jest-report.ts';
import type { RuleProof } from './jest-report.ts';
import { extractSpecRuleIds } from './rule-ids.ts';

/** Options of one run. */
export interface RulesCoverageOptions {
  /** Specification Markdown path. */
  readonly specPath: string;
  /** Folder holding the Jest `--json` reports (`*.json`). */
  readonly reportsDir: string;
  /** Evidence Markdown output path. */
  readonly outPath: string;
  /** Optional allow-missing list path (temporary, removed in TF-104-01). */
  readonly allowMissingPath?: string;
}

/** Outcome of one run. */
export interface RulesCoverageOutcome {
  /** Process exit code: 0 all rules proven or pending, 1 otherwise. */
  readonly exitCode: 0 | 1;
  /** Human-readable summary. */
  readonly message: string;
}

/** Default option values. */
const DEFAULTS: RulesCoverageOptions = {
  specPath: 'docs/specs/warlog/spec.md',
  reportsDir: 'reports',
  outPath: 'docs/evidence/rules-coverage.md',
};

/** Flags accepted on the command line, mapped to option names. */
const FLAGS: Readonly<Record<string, keyof RulesCoverageOptions>> = {
  '--spec': 'specPath',
  '--reports': 'reportsDir',
  '--out': 'outPath',
  '--allow-missing': 'allowMissingPath',
};

/**
 * Parses command-line arguments (`--flag value` pairs).
 * @param argv - Arguments after the script name.
 * @returns The options, defaults applied.
 * @throws {Error} On an unknown flag or a flag without value.
 */
export function parseArgs(argv: readonly string[]): RulesCoverageOptions {
  const options: Record<string, string> = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = String(argv[i]);
    const key = FLAGS[flag];
    const value = argv[i + 1];
    if (key === undefined || value === undefined) {
      throw new Error(`invalid argument: ${flag}`);
    }
    options[key] = value;
  }
  return options as unknown as RulesCoverageOptions;
}

/**
 * Reads every `*.json` report of a folder.
 * @param fs - File system.
 * @param dir - Reports folder.
 * @returns Proofs of all reports.
 * @throws {MalformedReportError} When a report is malformed.
 * @throws {Error} When the folder holds no report.
 */
async function readProofs(fs: RulesFileSystem, dir: string): Promise<RuleProof[]> {
  const files = (await fs.listDir(dir)).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    throw new Error(`no Jest JSON report in ${dir}`);
  }
  const proofs: RuleProof[] = [];
  for (const file of files) {
    proofs.push(...parseJestReport(file, await fs.readText(`${dir}/${file}`)));
  }
  return proofs;
}

/**
 * Runs the check.
 * @param options - Run options.
 * @param fs - File system.
 * @returns Exit code and summary; never throws for expected failures.
 */
export async function runRulesCoverage(options: RulesCoverageOptions, fs: RulesFileSystem): Promise<RulesCoverageOutcome> {
  try {
    const specRules = extractSpecRuleIds(await fs.readText(options.specPath));
    const proofs = await readProofs(fs, options.reportsDir);
    const allow =
      options.allowMissingPath === undefined ? new Set<string>() : parseAllowList(await fs.readText(options.allowMissingPath));
    const result = checkCoverage(specRules, proofs, allow);
    await fs.writeText(options.outPath, renderReport(result));
    const proven = result.rules.length - result.missing.length - result.pending.length;
    const summary = `rules proven ${proven}/${result.rules.length}, pending ${result.pending.length}`;
    if (result.missing.length > 0) {
      return { exitCode: 1, message: `${summary}; unproven: ${result.missing.join(', ')}` };
    }
    return { exitCode: 0, message: summary };
  } catch (error: unknown) {
    const reason = error instanceof MalformedReportError || error instanceof Error ? error.message : String(error);
    return { exitCode: 1, message: `rules-coverage failed: ${reason}` };
  }
}
