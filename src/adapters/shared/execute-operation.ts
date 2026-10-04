/**
 * The single call path shared by the MCP server and the command line (WL-35): split output
 * options, run the mediator, render the result. Both interfaces therefore return the same text
 * and the same errors for the same input.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { Mediator } from '../../core/mediator/mediator.ts';
import type { OperationRegistry } from '../../core/mediator/operation-registry.ts';
import type { Presenter } from '../../core/presenter/presenter.ts';
import { stringifyYaml } from '../../core/storage/yaml-codec.ts';
import { splitOutputOptions } from './output-options.ts';

/** Collaborators of an operation call. */
export interface ExecuteDeps {
  /** Operation catalog. */
  readonly registry: OperationRegistry;
  /** Mediator. */
  readonly mediator: Mediator;
  /** Presenter. */
  readonly presenter: Presenter;
}

/** Successful call. */
export interface ExecuteSuccess {
  /** Discriminant. */
  readonly ok: true;
  /** Rendered result (`valid` on a dry run). */
  readonly text: string;
  /** Warning codes. */
  readonly warnings: readonly string[];
}

/** Failed call. */
export interface ExecuteFailure {
  /** Discriminant. */
  readonly ok: false;
  /** Stable error. */
  readonly error: WarlogError;
}

/** Outcome of one call. */
export type ExecuteOutcome = ExecuteSuccess | ExecuteFailure;

/** Options of one call. */
export interface ExecuteOptions {
  /** Validate only (CLI `--validate`). */
  readonly dryRun?: boolean;
}

/**
 * Formats an error for a transport: `CODE: message` followed by YAML details.
 * @param error - Error.
 * @returns Text.
 */
export function formatError(error: WarlogError): string {
  const head = `${error.code}: ${error.message}`;
  return error.details === undefined ? head : `${head}\n${stringifyYaml(error.details).trimEnd()}`;
}

/**
 * Runs one operation and renders its result.
 * @param deps - Collaborators.
 * @param name - Operation name.
 * @param args - Raw arguments (input plus output options).
 * @param options - Call options.
 * @returns The outcome (never throws).
 */
export async function executeOperation(deps: ExecuteDeps, name: string, args: unknown, options: ExecuteOptions = {}): Promise<ExecuteOutcome> {
  try {
    const { input, output } = splitOutputOptions(args);
    const definition = deps.registry.get(name);
    const response = await deps.mediator.send(name, input, { dryRun: options.dryRun === true });
    const text = response.result === undefined ? 'valid' : deps.presenter.present(response.result, definition.defaultFormat, output);
    return { ok: true, text, warnings: response.warnings };
  } catch (error: unknown) {
    const mapped = error instanceof WarlogError ? error : new WarlogError('INTERNAL', 'internal error', undefined, { cause: error });
    return { ok: false, error: mapped };
  }
}
