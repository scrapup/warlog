/**
 * The single call path shared by the MCP server and the command line (WL-35): split output
 * options, run the mediator, render the result. Both interfaces therefore return the same text
 * and the same errors for the same input.
 */
import { errorFields } from '../../core/errors/error-fields.ts';
import type { Redaction } from '../../core/errors/path-redactor.ts';
import { redactError } from '../../core/errors/path-redactor.ts';
import { WarlogError, isWarlogError, toWarlogError } from '../../core/errors/warlog-error.ts';
import type { Mediator } from '../../core/mediator/mediator.ts';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { OperationRegistry } from '../../core/mediator/operation-registry.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { Logger } from '../../core/ports/logger.port.ts';
import type { PresentOptions, Presenter } from '../../core/presenter/presenter.ts';
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
  /** Logger (codes only). */
  readonly logger: Logger;
  /** Local path prefixes hidden in errors raised outside the mediator (home directory). */
  readonly redactions: readonly Redaction[];
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

/** Warning returned when a command succeeded but its output options could not be applied. */
export const OUTPUT_OPTIONS_IGNORED = 'output.options_ignored' as const;

/** What to render. */
interface RenderRequest {
  /** Operation. */
  readonly definition: OperationDefinition;
  /** Result. */
  readonly result: OperationResult;
  /** Output options. */
  readonly output: PresentOptions;
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
 * Logs a failure raised outside the mediator (unexpected errors at `error`, stable categories at
 * `debug` with the fields of their cause) and returns it as a redacted, stable error.
 * @param deps - Collaborators.
 * @param name - Operation name.
 * @param error - Thrown value.
 * @returns The failure.
 */
export function toLoggedFailure(deps: Pick<ExecuteDeps, 'logger' | 'redactions'>, name: string, error: unknown): ExecuteFailure {
  const stable = error instanceof WarlogError;
  const cause = stable && error.cause !== undefined ? { cause: errorFields(error.cause) } : {};
  deps.logger.log(stable ? 'debug' : 'error', 'op.failed', { op: name, stage: 'adapter', ...errorFields(error), ...cause });
  return { ok: false, error: redactError(toWarlogError(error), deps.redactions) };
}

/**
 * Renders a result. A command has already written: when its output options cannot be applied
 * (unknown field, table for a non-list), the default rendering is returned with a warning
 * instead of an error, so the caller does not retry a write that succeeded.
 * @param deps - Collaborators.
 * @param request - Operation, result and output options.
 * @returns Text and extra warnings.
 * @throws {WarlogError} `VALIDATION` for a query with invalid output options.
 */
function render(deps: ExecuteDeps, request: RenderRequest): ExecuteSuccess {
  const { definition, result, output } = request;
  try {
    return { ok: true, text: deps.presenter.present(result, definition.defaultFormat, output), warnings: [] };
  } catch (error: unknown) {
    if (definition.kind !== 'command' || !isWarlogError(error, 'VALIDATION')) {
      throw error;
    }
    deps.logger.log('debug', OUTPUT_OPTIONS_IGNORED, { op: definition.name, ...errorFields(error) });
    return { ok: true, text: deps.presenter.present(result, definition.defaultFormat), warnings: [OUTPUT_OPTIONS_IGNORED] };
  }
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
    if (response.result === undefined) {
      return { ok: true, text: 'valid', warnings: response.warnings };
    }
    const rendered = render(deps, { definition, result: response.result, output });
    return { ...rendered, warnings: [...response.warnings, ...rendered.warnings] };
  } catch (error: unknown) {
    return toLoggedFailure(deps, name, error);
  }
}
