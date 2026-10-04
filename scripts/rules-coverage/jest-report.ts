/**
 * Fail-closed reader of Jest `--json` reports.
 */
import { extractTitleRuleIds } from './rule-ids.ts';

/** One passing test that proves a rule. */
export interface RuleProof {
  /** Rule identifier proven. */
  readonly rule: string;
  /** Full test name (ancestors + title). */
  readonly test: string;
}

/** Error raised when a report does not have the expected Jest JSON shape. */
export class MalformedReportError extends Error {
  /** Report file that could not be read. */
  readonly file: string;

  /**
   * Creates the error.
   * @param file - Report file name.
   * @param reason - What is wrong with it.
   */
  constructor(file: string, reason: string) {
    super(`malformed Jest report ${file}: ${reason}`);
    this.name = 'MalformedReportError';
    this.file = file;
  }
}

/**
 * Tells whether a value is a non-null object.
 * @param value - Any value.
 * @returns `true` for objects (arrays included).
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the assertion results of one test file entry, failing closed on unexpected shapes.
 * @param file - Report file name (for errors).
 * @param entry - One element of `testResults`.
 * @returns The assertion results of the entry.
 * @throws {MalformedReportError} When the entry has no `assertionResults` array.
 */
function assertionsOf(file: string, entry: unknown): unknown[] {
  if (!isObject(entry) || !Array.isArray(entry['assertionResults'])) {
    throw new MalformedReportError(file, 'testResults[] without assertionResults[]');
  }
  return entry['assertionResults'];
}

/**
 * Converts one assertion result into proofs (only passing tests prove rules).
 * @param file - Report file name (for errors).
 * @param assertion - One element of `assertionResults`.
 * @returns Proofs for every rule prefixed to the title.
 * @throws {MalformedReportError} When `title`/`status` are not strings.
 */
function proofsOf(file: string, assertion: unknown): RuleProof[] {
  if (!isObject(assertion) || typeof assertion['title'] !== 'string' || typeof assertion['status'] !== 'string') {
    throw new MalformedReportError(file, 'assertion without string title/status');
  }
  if (assertion['status'] !== 'passed') {
    return [];
  }
  const title = assertion['title'];
  const test = typeof assertion['fullName'] === 'string' ? assertion['fullName'] : title;
  return extractTitleRuleIds(title).map((rule) => ({ rule, test }));
}

/**
 * Parses a Jest JSON report and returns the rule proofs it contains.
 * @param file - Report file name (for errors).
 * @param text - Report content.
 * @returns Proofs from passing tests.
 * @throws {MalformedReportError} When the content is not a Jest JSON report.
 */
export function parseJestReport(file: string, text: string): RuleProof[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new MalformedReportError(file, 'invalid JSON');
  }
  if (!isObject(data) || !Array.isArray(data['testResults'])) {
    throw new MalformedReportError(file, 'missing testResults[]');
  }
  return data['testResults'].flatMap((entry) => assertionsOf(file, entry).flatMap((a) => proofsOf(file, a)));
}
