/**
 * The command line (WL-35..WL-39): `warlog <group> <action>` generated from the registry, plus
 * `warlog mcp`. Every call goes through {@link executeOperation}, like the MCP server.
 */
import { Command, CommanderError, Option } from 'commander';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { executeOperation, formatError } from '../shared/execute-operation.ts';
import type { ExecuteDeps } from '../shared/execute-operation.ts';
import { collectInput, locateIssues } from './cli-input.ts';
import type { CollectedInput, FlagBinding, InputReader } from './cli-input.ts';
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

/** Flags every operation owns; a field may not reuse them. */
const RESERVED_FLAGS = new Set(['file', 'json-input', 'validate', 'format', 'fields', 'help']);

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
 * Builds the parser option of one field.
 * @param spec - Field spec.
 * @returns The option.
 * @throws {WarlogError} `INTERNAL` when the field reuses a reserved flag.
 */
function fieldOption(spec: FieldSpec): Option {
  if (RESERVED_FLAGS.has(spec.flag)) {
    throw new WarlogError('INTERNAL', `field ${spec.key} reuses the reserved flag --${spec.flag}`);
  }
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
 * Runs one operation from parsed options.
 * @param deps - Collaborators.
 * @param def - Operation.
 * @param bindings - Field flags.
 * @param opts - Parsed options.
 * @returns The exit code.
 */
async function runOperation(deps: CliDeps, def: OperationDefinition, bindings: readonly FlagBinding[], opts: Record<string, unknown>): Promise<number> {
  let input: CollectedInput;
  try {
    input = await collectInput(bindings, opts, deps.io);
  } catch (error: unknown) {
    const mapped = error instanceof WarlogError ? error : new WarlogError('INTERNAL', 'internal error', undefined, { cause: error });
    writeLine(deps.io, 'stderr', formatError(mapped));
    return exitCodeFor(mapped.code);
  }
  const outcome = await executeOperation(deps, def.name, input.args, { dryRun: opts['validate'] === true });
  if (!outcome.ok) {
    const error = locateIssues(outcome.error, input);
    writeLine(deps.io, 'stderr', formatError(error));
    return exitCodeFor(error.code);
  }
  writeLine(deps.io, 'stdout', outcome.text);
  if (outcome.warnings.length > 0) {
    writeLine(deps.io, 'stderr', `warnings: ${outcome.warnings.join(', ')}`);
  }
  return EXIT_OK;
}

/**
 * Adds the command of one operation to its group.
 * @param group - Group command.
 * @param def - Operation.
 * @param deps - Collaborators.
 * @param state - Exit code holder.
 */
function addOperation(group: Command, def: OperationDefinition, deps: CliDeps, state: RunState): void {
  const command = group.command(def.action).description(def.description).allowExcessArguments(false);
  command.configureHelp({ formatHelp: () => renderOperationHelp(def) });
  const bindings = fieldSpecs(def.input)
    .filter((spec) => spec.kind !== 'complex')
    .map((spec) => {
      const option = fieldOption(spec);
      command.addOption(option);
      return { spec, attribute: option.attributeName() };
    });
  command
    .option('--file <path>', 'input file (YAML, JSON or Markdown; - for standard input)')
    .option('--json-input <json>', 'input as a JSON object')
    .option('--validate', 'validate only; nothing is written')
    .addOption(new Option('--format <format>', 'output format').choices(['table', 'yaml', 'json']))
    .option('--fields <list>', 'comma-separated output fields')
    .action(async () => {
      state.exitCode = await runOperation(deps, def, bindings, command.opts());
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
    .configureOutput({ writeOut: (t) => deps.io.stdout(t), writeErr: (t) => deps.io.stderr(t) });
  const groups = new Map<string, Command>();
  for (const def of deps.registry.list()) {
    const group = groups.get(def.group) ?? program.command(def.group).description(`${def.group} operations`);
    groups.set(def.group, group);
    addOperation(group, def, deps, state);
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
    if (CLEAN_EXITS.has(error.code)) {
      return EXIT_OK;
    }
    return error.code === 'commander.help' ? error.exitCode : EXIT_VALIDATION;
  }
  return state.exitCode;
}
