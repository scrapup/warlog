/**
 * The command line (WL-35..WL-39): `warlog <group> <action>` generated from the registry, plus
 * `warlog mcp`. Every call goes through {@link executeOperation}, like the MCP server.
 */
import { Command, CommanderError, Option } from 'commander';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { executeOperation, formatError, toLoggedFailure } from '../shared/execute-operation.ts';
import type { ExecuteDeps, ExecuteOutcome } from '../shared/execute-operation.ts';
import { collectInput, locateIssues } from './cli-input.ts';
import type { CollectedInput, FlagBinding, InputReader } from './cli-input.ts';
import { COMMON_OPTIONS } from './common-options.ts';
import { EXIT_OK, EXIT_VALIDATION, exitCodeFor } from './exit-codes.ts';
import { fieldSpecs } from './flag-mapper.ts';
import type { FieldSpec } from './flag-mapper.ts';
import { renderOperationHelp } from './help-renderer.ts';

/** Process streams and input files of the command line. */
export interface CliIo extends InputReader {
  /**
   * Writes to standard output.
   * @param text - Text.
   */
  stdout(text: string): void;
  /**
   * Writes to standard error.
   * @param text - Text.
   */
  stderr(text: string): void;
}

/** Collaborators of the command line. */
export interface CliDeps extends ExecuteDeps {
  /** Streams and files. */
  readonly io: CliIo;
  /** Package version. */
  readonly version: string;
  /**
   * Starts the MCP server on standard input/output.
   * @returns Once the server is connected.
   */
  startMcp(): Promise<void>;
}

/** Exit code set by the action that ran. */
interface RunState {
  /** Exit code. */
  exitCode: number;
}

/** One operation command being wired. */
interface OperationCommand {
  /** Collaborators. */
  readonly deps: CliDeps;
  /** Operation. */
  readonly def: OperationDefinition;
  /** Exit code holder. */
  readonly state: RunState;
}

/** Reasons of command-line usage errors, by parser code. */
const USAGE_REASONS: Readonly<Record<string, string>> = {
  'commander.unknownOption': 'unknown_option',
  'commander.unknownCommand': 'unknown_command',
  'commander.excessArguments': 'too_many_arguments',
  'commander.invalidArgument': 'invalid_value',
  'commander.optionMissingArgument': 'missing_value',
};

/** Commander outcomes that are not usage errors. */
const CLEAN_EXITS = new Set(['commander.helpDisplayed', 'commander.version']);

/**
 * Collects a repeated flag into a list.
 * @param value - New value.
 * @param previous - Values so far.
 * @returns All values.
 */
function collect(value: string, previous: unknown): string[] {
  return [...(Array.isArray(previous) ? (previous as string[]) : []), value];
}

/**
 * Builds the parser option of one field (reserved names are rejected by the registry).
 * @param spec - Field spec.
 * @returns The option.
 */
function fieldOption(spec: FieldSpec): Option {
  if (spec.kind === 'boolean') {
    return new Option(`--${spec.flag} [value]`, spec.description);
  }
  const option = new Option(`--${spec.flag} <value>`, spec.description);
  return spec.kind.endsWith('-array') ? option.argParser(collect) : option;
}

/**
 * Writes text with a final newline.
 * @param io - Streams.
 * @param stream - Target stream.
 * @param text - Text.
 */
function writeLine(io: CliIo, stream: 'stdout' | 'stderr', text: string): void {
  io[stream](text.endsWith('\n') ? text : `${text}\n`);
}

/**
 * Prints an outcome and returns its exit code.
 * @param io - Streams.
 * @param outcome - Outcome.
 * @returns The exit code.
 */
function report(io: CliIo, outcome: ExecuteOutcome): number {
  if (!outcome.ok) {
    writeLine(io, 'stderr', formatError(outcome.error));
    return exitCodeFor(outcome.error.code);
  }
  writeLine(io, 'stdout', outcome.text);
  if (outcome.warnings.length > 0) {
    writeLine(io, 'stderr', `warnings: ${outcome.warnings.join(', ')}`);
  }
  return EXIT_OK;
}

/**
 * Runs one operation from parsed options.
 * @param op - Operation command.
 * @param bindings - Field flags.
 * @param opts - Parsed options.
 * @returns The exit code.
 */
async function runOperation(op: OperationCommand, bindings: readonly FlagBinding[], opts: Record<string, unknown>): Promise<number> {
  const { deps, def } = op;
  let input: CollectedInput;
  try {
    input = await collectInput(bindings, opts, deps.io);
  } catch (error: unknown) {
    return report(deps.io, toLoggedFailure(deps, def.name, error));
  }
  const outcome = await executeOperation(deps, def.name, input.args, { dryRun: opts['validate'] === true });
  return report(deps.io, outcome.ok ? outcome : { ok: false, error: locateIssues(outcome.error, input) });
}

/**
 * Adds the command of one operation to its parent (its group, or the program for a top-level command).
 * @param parent - Parent command.
 * @param op - Operation command.
 */
function addOperation(parent: Command, op: OperationCommand): void {
  const name = op.def.action === '' ? op.def.group : op.def.action;
  const command = parent.command(name).description(op.def.description).allowExcessArguments(false);
  command.configureHelp({ formatHelp: () => renderOperationHelp(op.def) });
  const bindings = fieldSpecs(op.def.input)
    .filter((spec) => spec.kind !== 'complex')
    .map((spec) => {
      const option = fieldOption(spec);
      command.addOption(option);
      return { spec, attribute: option.attributeName() };
    });
  for (const common of COMMON_OPTIONS) {
    const option = new Option(common.flags, common.description);
    command.addOption(common.choices === undefined ? option : option.choices(common.choices));
  }
  command.action(async () => {
    op.state.exitCode = await runOperation(op, bindings, command.opts());
  });
}

/**
 * Builds the program from the registry.
 * @param deps - Collaborators.
 * @param state - Exit code holder.
 * @returns The root command.
 */
function buildProgram(deps: CliDeps, state: RunState): Command {
  const program = new Command('warlog')
    .description('File-based memory and execution ledger for AI coding agents')
    .version(deps.version, '-V, --version')
    .exitOverride()
    .configureOutput({ writeOut: (t) => deps.io.stdout(t), writeErr: (t) => deps.io.stderr(t), outputError: () => undefined });
  const groups = new Map<string, Command>();
  for (const def of deps.registry.list()) {
    if (def.action === '') {
      addOperation(program, { deps, def, state });
      continue;
    }
    const group = groups.get(def.group) ?? program.command(def.group).description(`${def.group} operations`);
    groups.set(def.group, group);
    addOperation(group, { deps, def, state });
  }
  program
    .command('mcp')
    .description('Start the MCP server on standard input/output')
    .action(async () => {
      await deps.startMcp();
    });
  return program;
}

/**
 * Maps a parser outcome to an exit code; usage errors are printed as stable `VALIDATION` errors.
 * @param io - Streams.
 * @param error - Parser error.
 * @returns The exit code.
 */
function parserExit(io: CliIo, error: CommanderError): number {
  if (CLEAN_EXITS.has(error.code)) {
    return EXIT_OK;
  }
  if (error.code === 'commander.help') {
    return error.exitCode;
  }
  const message = error.message.replace(/^error: /, '');
  writeLine(io, 'stderr', formatError(new WarlogError('VALIDATION', message, { reason: USAGE_REASONS[error.code] ?? 'usage' })));
  return EXIT_VALIDATION;
}

/**
 * Runs the command line.
 * @param argv - Arguments after the executable and script.
 * @param deps - Collaborators.
 * @returns The process exit code (WL-39).
 */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const state: RunState = { exitCode: EXIT_OK };
  try {
    await buildProgram(deps, state).parseAsync([...argv], { from: 'user' });
  } catch (error: unknown) {
    if (!(error instanceof CommanderError)) {
      throw error;
    }
    return parserExit(deps.io, error);
  }
  return state.exitCode;
}
