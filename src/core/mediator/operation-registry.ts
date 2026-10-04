/**
 * The operation registry (plan §4.1): every operation defined once; invariants checked at
 * construction so both interfaces always expose a consistent catalog (WL-35, WL-37).
 */
import { WarlogError } from '../errors/warlog-error.ts';
import { compareCodeUnits } from '../security/compare.ts';
import type { OperationDefinition } from './operation-definition.ts';

/**
 * Tells whether a name is snake_case (`[a-z][a-z0-9_]*`).
 * @param name - Candidate.
 * @returns `true` for snake_case.
 */
function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(name);
}

/**
 * Input keys owned by the interfaces: output options (`format`, `fields`) and command-line
 * options (`--file`, `--json-input`, `--validate`, `--help`). A field may not reuse them, nor
 * start with `no_` (the command line reads `--no-x` as the negation of `--x`).
 */
export const RESERVED_INPUT_KEYS: readonly string[] = ['format', 'fields', 'file', 'json_input', 'validate', 'help'];

/**
 * Lists input keys that clash with the interfaces.
 * @param def - Definition.
 * @returns Offending keys.
 */
function reservedKeys(def: OperationDefinition): string[] {
  return Object.keys(def.input.shape).filter((k) => RESERVED_INPUT_KEYS.includes(k) || k.startsWith('no_'));
}

/**
 * Checks one definition.
 * @param def - Definition.
 * @returns Nothing.
 * @throws {WarlogError} `INTERNAL` describing the broken invariant.
 */
function checkDefinition(def: OperationDefinition): void {
  const problems: string[] = [];
  if (!isSnakeCase(def.name)) problems.push('name must be snake_case');
  if (def.description.trim() === '') problems.push('description is empty');
  if (def.examples.length === 0) problems.push('at least one example is required');
  const reserved = reservedKeys(def);
  if (reserved.length > 0) problems.push(`fields reuse reserved names: ${reserved.join(', ')}`);
  def.examples.forEach((example, i) => {
    if (!def.input.strict().safeParse(example).success) problems.push(`example ${i} does not match the input schema`);
  });
  if (problems.length > 0) {
    throw new WarlogError('INTERNAL', `operation ${def.name}: ${problems.join('; ')}`, { operation: def.name, problems });
  }
}

/** Immutable catalog of operations. */
export class OperationRegistry {
  /** Definitions by name. */
  private readonly byName = new Map<string, OperationDefinition>();

  /**
   * Builds the registry.
   * @param definitions - Every operation.
   * @throws {WarlogError} `INTERNAL` on a duplicate name or CLI path, or an invalid definition.
   */
  constructor(definitions: readonly OperationDefinition[]) {
    const paths = new Set<string>();
    for (const def of definitions) {
      checkDefinition(def);
      const path = `${def.group} ${def.action}`;
      if (this.byName.has(def.name) || paths.has(path)) {
        throw new WarlogError('INTERNAL', `duplicate operation ${def.name} (${path})`, { operation: def.name });
      }
      this.byName.set(def.name, def);
      paths.add(path);
    }
  }

  /**
   * Finds an operation by name.
   * @param name - Operation name.
   * @returns The definition.
   * @throws {WarlogError} `VALIDATION` for an unknown operation.
   */
  get(name: string): OperationDefinition {
    const def = this.byName.get(name);
    if (def === undefined) {
      throw new WarlogError('VALIDATION', `unknown operation ${name}`, { operation: name });
    }
    return def;
  }

  /**
   * Lists every operation sorted by name.
   * @returns Definitions.
   */
  list(): OperationDefinition[] {
    return [...this.byName.values()].sort((a, b) => compareCodeUnits(a.name, b.name));
  }
}
