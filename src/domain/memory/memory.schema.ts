/**
 * The memory model (plan §3.3, WL-15, WL-16): kinds, statuses, purposes and the per-kind fields,
 * validated here so every operation that writes a memory enforces the same shape.
 */
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { isUlid } from '../../core/security/identifiers.ts';
import { MAX_GLOB_LENGTH } from '../../core/security/glob-matcher.ts';

/** Memory kinds. */
export const MEMORY_KINDS = ['fact', 'decision', 'guardrail', 'pattern', 'command', 'known_issue', 'runbook'] as const;
/** Memory scopes. */
export const MEMORY_SCOPES = ['global', 'repo'] as const;
/** Lifecycle statuses (WL-17). */
export const MEMORY_STATUSES = ['active', 'stale', 'superseded', 'archived'] as const;
/** Purposes of a command. */
export const COMMAND_PURPOSES = ['run', 'test', 'build', 'lint', 'debug', 'logs', 'deploy', 'other'] as const;
/** Purposes of a runbook. */
export const RUNBOOK_PURPOSES = ['run', 'debug', 'logs', 'deploy'] as const;
/** States of a known issue. */
export const ISSUE_STATUSES = ['open', 'resolved'] as const;

/** A memory kind. */
export type MemoryKind = (typeof MEMORY_KINDS)[number];
/** A memory scope. */
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** Fields only some kinds carry, by kind (WL-15). */
export const KIND_FIELDS: Readonly<Record<MemoryKind, readonly string[]>> = {
  fact: [],
  decision: [],
  guardrail: [],
  pattern: ['applies_to', 'example'],
  command: ['cmd', 'purpose', 'known_error'],
  known_issue: ['symptom', 'cause', 'workaround', 'issue_status', 'resolution'],
  runbook: ['purpose', 'commands'],
};

/** Every kind-specific field name. */
export const ALL_KIND_FIELDS: readonly string[] = [...new Set(Object.values(KIND_FIELDS).flat())];

/** Kind-specific input fields of `memory_save`. */
export const KIND_INPUT = {
  applies_to: z.array(z.string().min(1).max(MAX_GLOB_LENGTH)).min(1).max(64).optional().describe('pattern: glob paths the pattern applies to (* within a segment, ** across segments, ? one character)'),
  example: z.string().max(20_000).optional().describe('pattern: an example'),
  cmd: z.string().trim().min(1).max(2_000).optional().describe('command: the command line'),
  purpose: z.enum(['run', 'test', 'build', 'lint', 'debug', 'logs', 'deploy', 'other']).optional().describe('command: run, test, build, lint, debug, logs, deploy or other; runbook: run, debug, logs or deploy'),
  known_error: z.string().max(10_000).optional().describe('command: the error it is known to produce'),
  symptom: z.string().trim().min(1).max(10_000).optional().describe('known_issue: what is observed'),
  cause: z.string().max(10_000).optional().describe('known_issue: the cause'),
  workaround: z.string().max(10_000).optional().describe('known_issue: a workaround'),
  issue_status: z.enum(ISSUE_STATUSES).optional().describe('known_issue: open (default) or resolved'),
  resolution: z.string().max(10_000).optional().describe('known_issue: how it was resolved'),
  commands: z.array(z.string().refine(isUlid, 'must be a ULID')).max(64).optional().describe('runbook: IDs of the command memories it uses'),
};

/** Problems found validating the fields of a kind. */
interface Problem {
  /** Field. */
  readonly path: string;
  /** What is wrong. */
  readonly message: string;
}

/**
 * Checks the kind-specific fields of a memory being created.
 * @param kind - Memory kind.
 * @param fields - Kind-specific fields as given (undefined values ignored).
 * @returns Defaults to store (`issue_status` open, command purpose other).
 * @throws {WarlogError} `VALIDATION` listing every problem by field.
 */
export function checkKindFields(kind: MemoryKind, fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const given = Object.entries(fields).filter(([, v]) => v !== undefined);
  const problems: Problem[] = given.filter(([k]) => !KIND_FIELDS[kind].includes(k)).map(([k]) => ({ path: k, message: `does not apply to kind ${kind}` }));
  /**
   * Tells whether a field was given.
   * @param key - Field name.
   * @returns `true` when present.
   */
  const has = (key: string): boolean => given.some(([k]) => k === key);
  const required: Partial<Record<MemoryKind, readonly string[]>> = { pattern: ['applies_to'], command: ['cmd'], known_issue: ['symptom'], runbook: ['purpose'] };
  (required[kind] ?? []).filter((k) => !has(k)).forEach((k) => problems.push({ path: k, message: `is required for kind ${kind}` }));
  if (kind === 'runbook' && has('purpose') && !(RUNBOOK_PURPOSES as readonly unknown[]).includes(fields['purpose'])) {
    problems.push({ path: 'purpose', message: `must be one of ${RUNBOOK_PURPOSES.join(', ')} for a runbook` });
  }
  if (problems.length > 0) {
    throw new WarlogError('VALIDATION', `invalid fields for kind ${kind}`, { issues: problems });
  }
  return { ...(kind === 'known_issue' ? { issue_status: 'open' } : {}), ...(kind === 'command' ? { purpose: 'other' } : {}), ...Object.fromEntries(given) };
}

/**
 * Checks the kind-specific fields of an update (kind and fields already stored).
 * @param kind - Memory kind.
 * @param fields - Fields being changed.
 * @throws {WarlogError} `VALIDATION` when a field does not apply to the kind or a runbook purpose is invalid.
 */
export function checkKindPatch(kind: MemoryKind, fields: Readonly<Record<string, unknown>>): void {
  const given = Object.entries(fields).filter(([, v]) => v !== undefined);
  const problems: Problem[] = given.filter(([k]) => !KIND_FIELDS[kind].includes(k)).map(([k]) => ({ path: k, message: `does not apply to kind ${kind}` }));
  if (kind === 'runbook' && fields['purpose'] !== undefined && !(RUNBOOK_PURPOSES as readonly unknown[]).includes(fields['purpose'])) {
    problems.push({ path: 'purpose', message: `must be one of ${RUNBOOK_PURPOSES.join(', ')} for a runbook` });
  }
  if (problems.length > 0) {
    throw new WarlogError('VALIDATION', `invalid fields for kind ${kind}`, { issues: problems });
  }
}
