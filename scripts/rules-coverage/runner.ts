/**
 * Orchestration of the rules-coverage check (plan §7.4): reads the specification and the
 * Jest JSON reports through an injected file system, writes the evidence file and returns
 * the exit code. Fails closed on an unreadable specification or report.
 */
import { checkCoverage, parseAllowList, renderReport } from './coverage-check.ts';
import type { CoverageResult } from './coverage-check.ts';
import type { RulesFileSystem } from './file-system.ts';
import { parseJestReport } from './jest-report.ts';
import type { RuleProof } from './jest-report.ts';
import { extractSpecRuleIds } from './rule-ids.ts';

/** Options of one run. */
export interface RulesCoverageOptions {
  /** Specification Markdown path. */
  readonly specPath: string;
  /** Directory holding the Jest `--json` reports (`*.json`). */
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

/** Mutable view of the options, used while parsing arguments. */
type MutableOptions = { -readonly [K in keyof RulesCoverageOptions]: RulesCoverageOptions[K] };

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
  const options: MutableOptions = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = String(argv[i]);
    const key = FLAGS[flag];
    const value = argv[i + 1];
    if (key === undefined || value === undefined) {
      throw new Error(`invalid argument: ${flag}`);
    }
    options[key] = value;
  }
  return options;
}

/**
 * Reads every `*.json` report of a directory.
 * @param fs - File system.
 * @param dir - Reports directory.
 * @returns Proofs of all reports.
 * @throws {Error} `MalformedReportError` when a report is malformed.
 * @throws {Error} When the directory holds no report.
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
 * Turns a coverage result into the run outcome.
 * @param result - Coverage result.
 * @param specPath - Specification path (for messages).
 * @returns The outcome.
 */
function outcomeOf(result: CoverageResult, specPath: string): RulesCoverageOutcome {
  if (result.absentFromSpec.length > 0) {
    return { exitCode: 1, message: `rules-coverage failed: ${specPath} lacks code-level rules ${result.absentFromSpec.join(', ')}` };
  }
  const summary = `rules proven ${result.proven}/${result.rules.length}, pending ${result.pending.length}`;
  if (result.missing.length > 0) {
    return { exitCode: 1, message: `${summary}; unproven: ${result.missing.join(', ')}` };
  }
  return { exitCode: 0, message: summary };
}

/**
 * Extracts a human-readable reason from a thrown value.
 * @param error - Thrown value.
 * @returns The error message, or the value as text.
 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the check.
 * @param options - Run options.
 * @param fs - File system.
 * @returns Exit code and summary; never throws.
 */
export async function runRulesCoverage(options: RulesCoverageOptions, fs: RulesFileSystem): Promise<RulesCoverageOutcome> {
  try {
    const specRules = extractSpecRuleIds(await fs.readText(options.specPath));
    const proofs = await readProofs(fs, options.reportsDir);
    const allow =
      options.allowMissingPath === undefined ? new Set<string>() : parseAllowList(await fs.readText(options.allowMissingPath));
    const result = checkCoverage(specRules, proofs, allow);
    await fs.writeText(options.outPath, renderReport(result, options.specPath));
    return outcomeOf(result, options.specPath);
  } catch (error: unknown) {
    return { exitCode: 1, message: `rules-coverage failed: ${reasonOf(error)}` };
  }
}

/**
 * Command-line entry: parses arguments and runs the check, never throwing.
 * @param argv - Arguments after the script name.
 * @param fs - File system.
 * @returns The outcome.
 */
export async function runFromArgs(argv: readonly string[], fs: RulesFileSystem): Promise<RulesCoverageOutcome> {
  let options: RulesCoverageOptions;
  try {
    options = parseArgs(argv);
  } catch (error: unknown) {
    return { exitCode: 1, message: `rules-coverage failed: ${reasonOf(error)}` };
  }
  return runRulesCoverage(options, fs);
}
