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

/** How the CLI loads the store for an operation (plan §3.7). */
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
  /** CLI action (e.g. `batch-update`). */
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
  /** CLI loading mode. */
  readonly load: LoadMode;
  /** Handler. */
  readonly handler: OperationHandler<z.infer<S>>;
}
