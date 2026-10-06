/**
 * Derives command-line flags from an operation's zod schema (WL-35, plan §4.4): scalars, enums
 * and arrays become `--kebab-case` flags; objects are accepted only through `--file` or
 * `--json-input`.
 */
import type { z } from 'zod';

/** How a flag value is converted. */
export type FlagKind = 'string' | 'number' | 'boolean' | 'enum' | 'string-array' | 'number-array' | 'typed-text' | 'complex';

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
  /** Union members. */
  readonly options?: readonly SchemaNode[];
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

/** Help labels of structured types accepted only through `--file` / `--json-input`. */
const COMPLEX_LABELS: Readonly<Record<string, string>> = { array: 'object[]', object: 'object', record: 'object' };

/** Wrappers that do not change the value kind. */
const WRAPPERS = new Set(['optional', 'default', 'nullable', 'prefault', 'readonly']);

/** Wrappers that make a field optional (`nullable` and `readonly` do not). */
const OPTIONAL_WRAPPERS = new Set(['optional', 'default', 'prefault']);

/**
 * Views a zod schema through the fields this module reads. zod v4 exposes `def` (`type`,
 * `innerType`, `element`, `entries`, `defaultValue`) and `description` as its introspection API,
 * but object shapes are typed with the core `$ZodType`, which does not overlap `SchemaNode`
 * structurally, hence this single `as unknown as` cast; the fields read are pinned for the
 * installed zod version by `flag-mapper.test.ts`.
 * @param schema - A zod schema.
 * @returns Its introspection view.
 */
function asSchemaNode(schema: z.core.$ZodType): SchemaNode {
  return schema as unknown as SchemaNode;
}

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
    optional = optional || OPTIONAL_WRAPPERS.has(current.def.type);
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
  return unionKind(node) ?? { kind: 'complex', typeLabel: COMPLEX_LABELS[type] ?? type };
}

/**
 * Kind of a union that includes scalar members: its flag takes JSON-or-text.
 * @param node - Schema node.
 * @returns The kind, or `undefined` for other nodes.
 */
function unionKind(node: SchemaNode): KindLabel | undefined {
  const scalarMember = (node.def.options ?? []).some((o) => o.def.type in SCALAR_KINDS);
  return node.def.type === 'union' && scalarMember ? { kind: 'typed-text', typeLabel: 'json | text' } : undefined;
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
    const field = asSchemaNode(value);
    const { node, optional, defaultValue } = unwrap(field);
    const { kind, typeLabel } = kindOf(node);
    const choices = node.def.type === 'enum' ? Object.values(node.def.entries ?? {}) : undefined;
    const description = field.description ?? node.description ?? '';
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
 * Converts a boolean flag value (`--x`, `--x true`, `--x false`; other text is kept for validation).
 * @param raw - Parsed value.
 * @returns A boolean, or the raw value.
 */
function toBoolean(raw: unknown): unknown {
  if (raw === true || raw === 'true') {
    return true;
  }
  return raw === 'false' ? false : raw;
}

/**
 * Reads the text of a typed-text flag: valid JSON (`true`, `12`, `"a b"`, `[1]`, `{"a":1}`) keeps
 * the type it was written with; anything else (`no`, `012`, plain words) stays a string, so a
 * value is never coerced by guessing (WL-28).
 * @param text - Flag text.
 * @returns The parsed JSON value, or the text.
 */
function toTypedText(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && ['string', 'number', 'boolean', 'object'].includes(typeof parsed) ? parsed : text;
  } catch {
    return text;
  }
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
      return toBoolean(raw);
    case 'typed-text':
      return typeof raw === 'string' ? toTypedText(raw) : raw;
    case 'string-array':
      return values;
    case 'number-array':
      return values.map((v) => (typeof v === 'string' ? toNumber(v) : v));
    default:
      return raw;
  }
}
