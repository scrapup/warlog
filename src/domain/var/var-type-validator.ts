/**
 * Declared variable types (WL-26) and strict type checks: a value is never coerced, so `"no"`,
 * `"012"` and `"1.10"` stay strings and `false` stays a boolean (WL-28).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';

/** The declarable types. */
export const VAR_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object'] as const;

/** A variable type. */
export type VarType = (typeof VAR_TYPES)[number];

/**
 * Tells whether a text names a variable type.
 * @param text - Candidate.
 * @returns `true` for a declarable type.
 */
export function isVarType(text: unknown): text is VarType {
  return typeof text === 'string' && (VAR_TYPES as readonly string[]).includes(text);
}

/**
 * Tells whether a value has exactly a declared type.
 * @param type - Declared type.
 * @param value - Value.
 * @returns `true` when it matches (no coercion).
 */
export function matchesType(type: VarType, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    default:
      return isPlainRecord(value);
  }
}

/**
 * Infers the type of a value written without a declared type.
 * @param value - Value.
 * @returns The narrowest type (`integer` for whole numbers).
 * @throws {WarlogError} `VALIDATION` for `null`, functions and other unsupported values.
 */
export function inferType(value: unknown): VarType {
  const found = VAR_TYPES.find((t) => t !== 'number' && matchesType(t, value));
  if (found !== undefined) {
    return found;
  }
  if (matchesType('number', value)) {
    return 'number';
  }
  throw new WarlogError('VALIDATION', 'value must be a string, number, boolean, array or object', { field: 'value' });
}

/**
 * Checks a value against its declared type.
 * @param type - Declared type.
 * @param value - Value.
 * @throws {WarlogError} `VALIDATION` naming the declared and found types.
 */
export function assertType(type: VarType, value: unknown): void {
  if (!matchesType(type, value)) {
    throw new WarlogError('VALIDATION', `value does not match type ${type}`, { field: 'value', type, found: describeType(value) });
  }
}

/**
 * Type name of a value, for messages and for `var_get --path` results.
 * @param value - Value.
 * @returns A declared type name, or `null` / `unsupported`.
 */
export function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  try {
    return inferType(value);
  } catch {
    return 'unsupported';
  }
}
