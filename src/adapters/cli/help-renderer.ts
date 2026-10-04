/**
 * Operation help (WL-37): description, usage, a parameter table (flag, type, required, default,
 * description) and an example input file, all derived from the registry entry.
 */
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { stringifyYaml } from '../../core/storage/yaml-codec.ts';
import { fieldSpecs } from './flag-mapper.ts';
import type { FieldSpec } from './flag-mapper.ts';

/** Options every operation accepts, shown after its parameters. */
const COMMON_OPTIONS: readonly (readonly string[])[] = [
  ['--file <path>', 'Read input from a YAML, JSON or Markdown file (`-` for standard input)'],
  ['--json-input <json>', 'Read input from a JSON object'],
  ['--validate', 'Validate the input only; nothing is written'],
  ['--format <format>', 'Output format: table | yaml | json'],
  ['--fields <list>', 'Comma-separated fields to keep in the output'],
  ['-h, --help', 'Show this help'],
];

/**
 * Formats rows as aligned columns.
 * @param rows - Cells per row.
 * @returns Lines indented by two spaces.
 */
function columns(rows: readonly (readonly string[])[]): string[] {
  const widths = rows.reduce<number[]>((w, row) => row.map((cell, i) => Math.max(w[i] ?? 0, cell.length)), []);
  return rows.map((row) => `  ${row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0))).join('  ')}`.trimEnd());
}

/**
 * Renders the flag of one field.
 * @param spec - Field spec.
 * @returns Flag text (`--file`-only for structured fields).
 */
function flagText(spec: FieldSpec): string {
  if (spec.kind === 'complex') {
    return `(${spec.key}: --file / --json-input)`;
  }
  return spec.kind === 'boolean' ? `--${spec.flag}` : `--${spec.flag} <value>`;
}

/**
 * Renders a default value.
 * @param spec - Field spec.
 * @returns Text, or `-` without default.
 */
function defaultText(spec: FieldSpec): string {
  return spec.defaultValue === undefined ? '-' : JSON.stringify(spec.defaultValue);
}

/**
 * Renders the help of one operation.
 * @param def - Operation definition.
 * @returns Help text.
 */
export function renderOperationHelp(def: OperationDefinition): string {
  const specs = fieldSpecs(def.input);
  const params = specs.map((s) => [flagText(s), s.typeLabel, s.required ? 'yes' : 'no', defaultText(s), s.description]);
  const example = stringifyYaml(def.examples[0] ?? {}).trimEnd();
  return [
    `Usage: warlog ${def.group} ${def.action} [options]`,
    '',
    def.description,
    '',
    'Parameters:',
    ...(params.length === 0 ? ['  (none)'] : columns([['FLAG', 'TYPE', 'REQUIRED', 'DEFAULT', 'DESCRIPTION'], ...params])),
    '',
    'Options:',
    ...columns(COMMON_OPTIONS),
    '',
    `Example input file (warlog ${def.group} ${def.action} --file input.yaml):`,
    ...example.split('\n').map((line) => `  ${line}`),
    '',
  ].join('\n');
}
