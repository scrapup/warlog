/**
 * Options every operation command accepts (WL-36, WL-38): the single source for the parser and
 * the help text. Their names are reserved for input fields by `RESERVED_INPUT_KEYS` in the
 * registry (core cannot import adapters); a test keeps both lists aligned.
 */
import { OUTPUT_FORMATS } from '../shared/output-options.ts';

/** One common option. */
export interface CommonOption {
  /** Commander flags (e.g. `--file <path>`). */
  readonly flags: string;
  /** Help text. */
  readonly description: string;
  /** Allowed values, when restricted. */
  readonly choices?: readonly string[];
}

/** The common options, in help order. */
export const COMMON_OPTIONS: readonly CommonOption[] = [
  { flags: '--file <path>', description: 'Read input from a YAML, JSON or Markdown file (`-` for standard input)' },
  { flags: '--json-input <json>', description: 'Read input from a JSON object (prefer --file - for sensitive values)' },
  { flags: '--validate', description: 'Validate the input only; nothing is written' },
  { flags: '--format <format>', description: `Output format: ${OUTPUT_FORMATS.join(' | ')}`, choices: OUTPUT_FORMATS },
  { flags: '--fields <list>', description: 'Comma-separated fields to keep in the output' },
];

/** The help option, shown last. */
export const HELP_OPTION: CommonOption = { flags: '-h, --help', description: 'Show this help' };
