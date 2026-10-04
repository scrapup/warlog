/**
 * Definition of one operation (plan §4.1): the single source for the MCP tool, the CLI command,
 * file validation, help and the skill catalog (WL-35).
 */
import type { z } from 'zod';
import type { WarlogError } from '../errors/warlog-error.ts';
import type { OperationContext } from './operation-context.ts';
import type { OperationResult } from './operation-result.ts';

/** Whether an operation writes (`command`) or only reads (`query`). */
export type OperationKind = 'command' | 'query';

/** Index access an operation needs (plan §3.7): `point` operations may not request the full index, in either interface; the command line uses it to avoid full scans. */
export type LoadMode = 'point' | 'full';

/** Default rendering of a result. */
export type DefaultFormat = 'table' | 'yaml';

/** Executes one operation (domain logic only). */
export interface OperationHandler<I> {
  /**
   * Runs the operation.
   * @param input - Validated input.
   * @param context - Request context.
   * @returns The result.
   * @throws {WarlogError} Any stable error category.
   */
  handle(input: I, context: OperationContext): Promise<OperationResult>;
}

/** Registry entry of one operation. */
export interface OperationDefinition<S extends z.ZodObject = z.ZodObject> {
  /** snake_case name, also the MCP tool name (e.g. `task_update`). */
  readonly name: string;
  /** CLI group (e.g. `task`). */
  readonly group: string;
  /** CLI action (e.g. `batch-update`); `''` for a top-level command (`warlog doctor`). */
  readonly action: string;
  /** Command or query. */
  readonly kind: OperationKind;
  /** Strict input schema. */
  readonly input: S;
  /** Help text. */
  readonly description: string;
  /** Example inputs (at least one; used by help and the skill catalog). */
  readonly examples: readonly Readonly<Record<string, unknown>>[];
  /** Default rendering. */
  readonly defaultFormat: DefaultFormat;
  /** Index access (see {@link LoadMode}). */
  readonly load: LoadMode;
  /** Handler. */
  readonly handler: OperationHandler<z.infer<S>>;
}

/**
 * Command-line words of an operation.
 * @param def - Operation definition.
 * @returns `[group, action]`, or `[group]` for a top-level command.
 */
export function commandWords(def: Pick<OperationDefinition, 'group' | 'action'>): string[] {
  return isTopLevel(def) ? [def.group] : [def.group, def.action];
}

/**
 * Tells whether an operation is a top-level command (`warlog doctor`).
 * @param def - Operation definition.
 * @returns `true` when it has no action.
 */
export function isTopLevel(def: Pick<OperationDefinition, 'action'>): boolean {
  return def.action === '';
}
