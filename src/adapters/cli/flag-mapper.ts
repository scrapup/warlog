/**
 * Derives command-line flags from an operation's zod schema (WL-35, plan §4.4): scalars, enums
 * and arrays become `--kebab-case` flags; objects are accepted only through `--file` or
 * `--json-input`.
 */
import type { z } from 'zod';

/** How a flag value is converted. */
export type FlagKind = 'string' | 'number' | 'boolean' | 'enum' | 'string-array' | 'number-array' | 'complex';

/** One input field as seen by the command line. */
export interface FieldSpec {
  /** Input key (snake_case). */
  readonly key: string;
  /** Flag name without dashes (kebab-case). */
  readonly flag: string;
  /** Conversion kind. */
  readonly kind: FlagKind;
  /** Whether the field is required. */
  readonly required: boolean;
  /** Default value, when declared. */
  readonly defaultValue?: unknown;
  /** Allowed values of an enum. */
  readonly choices?: readonly string[];
  /** Help text. */
  readonly description: string;
  /** Human-readable type for help. */
  readonly typeLabel: string;
}

/** Internal view of a zod definition. */
interface SchemaDef {
  /** Node type (`string`, `optional`, `array`, …). */
  readonly type: string;
  /** Wrapped schema (optional, default, nullable). */
  readonly innerType?: SchemaNode;
  /** Array element schema. */
  readonly element?: SchemaNode;
  /** Enum entries. */
  readonly entries?: Record<string, string>;
  /** Default value. */
  readonly defaultValue?: unknown;
}

/** Internal view of a zod schema node. */
interface SchemaNode {
  /** zod definition. */
  readonly def: SchemaDef;
  /** Description from `.describe()`. */
  readonly description?: string;
}

/** A schema node without its wrappers. */
interface Unwrapped {
  /** Innermost node. */
  readonly node: SchemaNode;
  /** Whether a wrapper made it optional. */
  readonly optional: boolean;
  /** Declared default. */
  readonly defaultValue?: unknown;
}

/** Kind and help label of a field. */
interface KindLabel {
  /** Conversion kind. */
  readonly kind: FlagKind;
  /** Help label. */
  readonly typeLabel: string;
}

/** Kinds of scalar node types. */
const SCALAR_KINDS: Readonly<Record<string, FlagKind>> = { string: 'string', number: 'number', boolean: 'boolean' };

/** Kinds of array element types. */
const ARRAY_KINDS: Readonly<Record<string, KindLabel>> = {
  string: { kind: 'string-array', typeLabel: 'string[]' },
  enum: { kind: 'string-array', typeLabel: 'string[]' },
  number: { kind: 'number-array', typeLabel: 'number[]' },
};

/** Wrappers that do not change the value kind. */
const WRAPPERS = new Set(['optional', 'default', 'nullable', 'prefault', 'readonly']);

/**
 * Removes optional/default/nullable wrappers.
 * @param node - Schema node.
 * @returns The innermost node, whether it was optional and its default.
 */
function unwrap(node: SchemaNode): Unwrapped {
  let current = node;
  let optional = false;
  let defaultValue: unknown;
  while (WRAPPERS.has(current.def.type) && current.def.innerType !== undefined) {
    optional = optional || current.def.type !== 'nullable';
    if (current.def.type === 'default') {
      defaultValue = current.def.defaultValue;
    }
    current = current.def.innerType;
  }
  return defaultValue === undefined ? { node: current, optional } : { node: current, optional, defaultValue };
}

/**
 * Kind and label of an unwrapped node.
 * @param node - Schema node.
 * @returns Kind and type label.
 */
function kindOf(node: SchemaNode): KindLabel {
  const type = node.def.type;
  const scalar = SCALAR_KINDS[type];
  if (scalar !== undefined) {
    return { kind: scalar, typeLabel: type };
  }
  if (type === 'enum') {
    return { kind: 'enum', typeLabel: Object.values(node.def.entries ?? {}).join(' | ') };
  }
  if (type === 'array' && node.def.element !== undefined) {
    const array = ARRAY_KINDS[unwrap(node.def.element).node.def.type];
    if (array !== undefined) {
      return array;
    }
  }
  return { kind: 'complex', typeLabel: type === 'array' ? 'object[]' : 'object' };
}

/**
 * Converts a snake_case key to a kebab-case flag.
 * @param key - Input key.
 * @returns Flag name without dashes.
 */
export function toFlagName(key: string): string {
  return key.split('_').join('-');
}

/**
 * Describes every field of an input schema.
 * @param schema - Operation input.
 * @returns Field specs in declaration order.
 */
export function fieldSpecs(schema: z.ZodObject): FieldSpec[] {
  return Object.entries(schema.shape).map(([key, value]) => {
    const { node, optional, defaultValue } = unwrap(value as unknown as SchemaNode);
    const { kind, typeLabel } = kindOf(node);
    const choices = node.def.type === 'enum' ? Object.values(node.def.entries ?? {}) : undefined;
    const description = (value as unknown as SchemaNode).description ?? node.description ?? '';
    return {
      key,
      flag: toFlagName(key),
      kind,
      required: !optional,
      typeLabel,
      description,
      ...(defaultValue === undefined ? {} : { defaultValue }),
      ...(choices === undefined ? {} : { choices }),
    };
  });
}

/**
 * Converts a numeric flag value (non-numeric text is kept so validation reports it).
 * @param value - Raw text.
 * @returns A number, or the text.
 */
function toNumber(value: string): number | string {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) ? n : value;
}

/**
 * Converts a raw flag value to the field's type.
 * @param spec - Field spec.
 * @param raw - Value(s) collected by the parser.
 * @returns The converted value.
 */
export function convertFlagValue(spec: FieldSpec, raw: unknown): unknown {
  const values = (Array.isArray(raw) ? raw : [raw]).flatMap((v) => (typeof v === 'string' ? v.split(',') : [v]));
  switch (spec.kind) {
    case 'number':
      return typeof raw === 'string' ? toNumber(raw) : raw;
    case 'boolean':
      return raw === true || raw === 'true' ? true : raw === 'false' ? false : raw;
    case 'string-array':
      return values;
    case 'number-array':
      return values.map((v) => (typeof v === 'string' ? toNumber(v) : v));
    default:
      return raw;
  }
}
