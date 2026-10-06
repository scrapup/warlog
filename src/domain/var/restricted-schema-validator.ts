/**
 * Optional structural schema of a variable (plan §3.5): a restricted subset of JSON Schema.
 * Only structural keywords are allowed — `pattern`, `patternProperties`, `format` and `$ref` are
 * rejected because a caller-supplied regular expression would break WL-48. The schema is checked
 * (keywords, depth, size) before it is compiled, and validation reports paths and rules, never
 * the offending values.
 */
import { Ajv } from 'ajv';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import { isPlainRecord } from '../../core/security/plain-record.ts';

/** Keywords a schema may use. */
export const ALLOWED_KEYWORDS: readonly string[] = [
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'additionalProperties',
];

/** Types a schema may name. */
const SCHEMA_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];

/** Deepest nesting of a schema. */
export const MAX_SCHEMA_DEPTH = 16;

/** Most schema nodes. */
export const MAX_SCHEMA_NODES = 500;

/** Keywords holding one number. */
const NUMBER_KEYWORDS = ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'];

/**
 * Fails with a schema problem.
 * @param path - Location in the schema.
 * @param message - What is wrong.
 * @throws {WarlogError} `VALIDATION`.
 */
function reject(path: string, message: string): never {
  throw new WarlogError('VALIDATION', `schema${path}: ${message}`, { field: 'schema', path });
}

/** Counters shared while walking a schema. */
interface Walk {
  /** Nodes seen. */
  nodes: number;
}

/**
 * Checks the scalar keywords of one node.
 * @param node - Schema node.
 * @param path - Location.
 * @throws {WarlogError} `VALIDATION`.
 */
function checkScalars(node: Record<string, unknown>, path: string): void {
  const type = node['type'];
  const types = Array.isArray(type) ? type : type === undefined ? [] : [type];
  if (!types.every((t) => typeof t === 'string' && SCHEMA_TYPES.includes(t))) {
    reject(`${path}.type`, `must be one of ${SCHEMA_TYPES.join(', ')}`);
  }
  NUMBER_KEYWORDS.filter((k) => k in node && !(typeof node[k] === 'number' && Number.isFinite(node[k]))).forEach((k) => reject(`${path}.${k}`, 'must be a number'));
  checkLists(node, path);
}

/**
 * Checks the list keywords of one node.
 * @param node - Schema node.
 * @param path - Location.
 * @throws {WarlogError} `VALIDATION`.
 */
function checkLists(node: Record<string, unknown>, path: string): void {
  const required = node['required'];
  if (required !== undefined && !(Array.isArray(required) && required.every((r) => typeof r === 'string'))) {
    reject(`${path}.required`, 'must be an array of names');
  }
  if ('enum' in node && !Array.isArray(node['enum'])) {
    reject(`${path}.enum`, 'must be an array');
  }
}

/**
 * Checks one schema node and its children.
 * @param node - Schema node.
 * @param path - Location.
 * @param depth - Current depth.
 * @param walk - Shared counters.
 * @throws {WarlogError} `VALIDATION` for a forbidden keyword, an oversized schema or a malformed node.
 */
function checkNode(node: unknown, path: string, depth: number, walk: Walk): void {
  walk.nodes += 1;
  if (depth > MAX_SCHEMA_DEPTH || walk.nodes > MAX_SCHEMA_NODES) {
    reject(path, 'schema is too deep or too large');
  }
  if (!isPlainRecord(node)) {
    reject(path, 'must be an object');
  }
  const unknown = Object.keys(node).find((k) => !ALLOWED_KEYWORDS.includes(k));
  if (unknown !== undefined) {
    reject(`${path}.${unknown}`, `keyword ${unknown} is not allowed (allowed: ${ALLOWED_KEYWORDS.join(', ')})`);
  }
  checkScalars(node, path);
  checkChildren(node, path, depth, walk);
}

/**
 * Checks the nested schemas of one node.
 * @param node - Schema node.
 * @param path - Location.
 * @param depth - Current depth.
 * @param walk - Shared counters.
 * @throws {WarlogError} `VALIDATION`.
 */
function checkChildren(node: Record<string, unknown>, path: string, depth: number, walk: Walk): void {
  const properties = node['properties'];
  if (properties !== undefined && !isPlainRecord(properties)) {
    reject(`${path}.properties`, 'must be an object');
  }
  Object.entries(isPlainRecord(properties) ? properties : {}).forEach(([name, child]) => checkNode(child, `${path}.properties.${name}`, depth + 1, walk));
  if (node['items'] !== undefined) {
    checkNode(node['items'], `${path}.items`, depth + 1, walk);
  }
  const extra = node['additionalProperties'];
  if (extra !== undefined && typeof extra !== 'boolean') {
    checkNode(extra, `${path}.additionalProperties`, depth + 1, walk);
  }
}

/**
 * Checks that a schema only uses the allowed keywords and stays small.
 * @param schema - Candidate schema.
 * @throws {WarlogError} `VALIDATION` naming the path and the problem.
 */
export function assertRestrictedSchema(schema: unknown): void {
  checkNode(schema, '', 0, { nodes: 0 });
}

/** One schema violation. */
export interface SchemaIssue {
  /** Location in the value (`''` = the value itself). */
  readonly path: string;
  /** The rule that failed. */
  readonly message: string;
}

/**
 * Validates a value against a restricted schema.
 * @param schema - Schema (checked first).
 * @param value - Value.
 * @returns The violations (empty when valid).
 * @throws {WarlogError} `VALIDATION` when the schema itself is not allowed.
 */
export function schemaViolations(schema: unknown, value: unknown): SchemaIssue[] {
  assertRestrictedSchema(schema);
  const validate = new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile(schema as Record<string, unknown>);
  return validate(value) ? [] : (validate.errors ?? []).map((e) => ({ path: e.instancePath, message: e.message ?? 'is invalid' }));
}

/**
 * Fails when a value violates its schema.
 * @param schema - Schema.
 * @param value - Value.
 * @throws {WarlogError} `VALIDATION` listing every violation by path.
 */
export function assertMatchesSchema(schema: unknown, value: unknown): void {
  const issues = schemaViolations(schema, value);
  if (issues.length > 0) {
    throw new WarlogError('VALIDATION', 'value does not match the schema', { field: 'value', issues: issues.map((i) => ({ path: `value${i.path.split('/').join('.')}`, message: i.message })) });
  }
}
