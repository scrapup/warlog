/**
 * Test helper: compares the tool schemas of the current tracker with warlog's (TF-97-09). Names,
 * parameter names, types, enums, defaults and required sets must match, except the deliberate
 * deviations of plan §1.1 listed in {@link DEVIATIONS}.
 */

/** A JSON schema node. */
export type SchemaNode = Readonly<Record<string, unknown>>;

/** A tool descriptor (name and input schema). */
export interface ToolSchema {
  /** Tool name. */
  readonly name: string;
  /** Input schema. */
  readonly inputSchema: SchemaNode;
}

/** The deliberate deviations (plan §1.1, §3.3, §4.2). */
export const DEVIATIONS = {
  /** Identifiers are ULID strings instead of integers (WL-11). */
  idType: { from: 'integer', to: 'string' },
  /** Parameters added by warlog (story hierarchy WL-12; task codes of plan §3.3). */
  addedParameters: { task_create: ['code', 'story_id'], task_list: ['story_id'], task_update: ['code'] } as Readonly<Record<string, readonly string[]>>,
  /** Parameters no longer required (`epic_id` optional when `story_id` is given, WL-12). */
  relaxedRequired: { task_create: ['epic_id'] } as Readonly<Record<string, readonly string[]>>,
  /** Output options every warlog tool accepts (WL-38). */
  outputOptions: ['format', 'fields'],
} as const;

/** Parameter names holding identifiers. */
const ID_NAMES = new Set(['id', 'ids', 'ordered_ids', 'depends_on', 'blocks']);

/**
 * Tells whether a parameter holds identifiers.
 * @param name - Parameter name.
 * @returns `true` for ids.
 */
function isIdName(name: string): boolean {
  return ID_NAMES.has(name) || name.endsWith('_id');
}

/**
 * Properties of an object schema.
 * @param node - Schema.
 * @returns Properties.
 */
function propertiesOf(node: SchemaNode): Record<string, SchemaNode> {
  const props = node['properties'];
  return typeof props === 'object' && props !== null ? (props as Record<string, SchemaNode>) : {};
}

/**
 * Required names of an object schema.
 * @param node - Schema.
 * @returns Sorted names.
 */
function requiredOf(node: SchemaNode): string[] {
  const req = node['required'];
  return Array.isArray(req) ? req.map(String).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) : [];
}

/**
 * Compares two property schemas.
 * @param path - Location for messages.
 * @param saga - Current tracker schema.
 * @param warlog - warlog schema.
 * @param idParam - Whether the property holds identifiers.
 * @returns Differences.
 */
function compareNode(path: string, saga: SchemaNode, warlog: SchemaNode, idParam: boolean): string[] {
  const out: string[] = [];
  const sagaType = saga['type'];
  const expectedType = idParam && sagaType === DEVIATIONS.idType.from ? DEVIATIONS.idType.to : sagaType;
  if (expectedType !== warlog['type']) {
    out.push(`${path}: type ${String(sagaType)} vs ${String(warlog['type'])}`);
  }
  if (JSON.stringify(saga['enum']) !== JSON.stringify(warlog['enum'])) {
    out.push(`${path}: enum ${JSON.stringify(saga['enum'])} vs ${JSON.stringify(warlog['enum'])}`);
  }
  if (JSON.stringify(saga['default']) !== JSON.stringify(warlog['default'])) {
    out.push(`${path}: default ${JSON.stringify(saga['default'])} vs ${JSON.stringify(warlog['default'])}`);
  }
  if (saga['items'] !== undefined) {
    out.push(...compareNode(`${path}[]`, saga['items'] as SchemaNode, (warlog['items'] ?? {}) as SchemaNode, idParam));
  }
  if (saga['properties'] !== undefined) {
    out.push(...compareObject(path, saga, warlog, undefined));
  }
  return out;
}

/**
 * Compares two object schemas.
 * @param path - Location (tool name at the top).
 * @param saga - Current tracker schema.
 * @param warlog - warlog schema.
 * @param tool - Tool name, at the top level (deviations apply there).
 * @returns Differences.
 */
function compareObject(path: string, saga: SchemaNode, warlog: SchemaNode, tool: string | undefined): string[] {
  const sagaProps = propertiesOf(saga);
  const warlogProps = propertiesOf(warlog);
  const allowedExtra = tool === undefined ? [] : [...(DEVIATIONS.addedParameters[tool] ?? []), ...DEVIATIONS.outputOptions];
  const out = Object.keys(sagaProps).flatMap((name) =>
    warlogProps[name] === undefined ? [`${path}.${name}: missing`] : compareNode(`${path}.${name}`, sagaProps[name] as SchemaNode, warlogProps[name] as SchemaNode, isIdName(name)),
  );
  out.push(...Object.keys(warlogProps).filter((n) => sagaProps[n] === undefined && !allowedExtra.includes(n)).map((n) => `${path}.${n}: extra`));
  const relaxed = tool === undefined ? [] : (DEVIATIONS.relaxedRequired[tool] ?? []);
  const sagaRequired = requiredOf(saga).filter((n) => !relaxed.includes(n));
  if (JSON.stringify(sagaRequired) !== JSON.stringify(requiredOf(warlog))) {
    out.push(`${path}: required ${JSON.stringify(sagaRequired)} vs ${JSON.stringify(requiredOf(warlog))}`);
  }
  return out;
}

/**
 * Compares the current tracker's tools with warlog's.
 * @param saga - Current tracker tools.
 * @param warlog - warlog tools.
 * @returns Differences (empty when only the listed deviations differ).
 */
export function compareTools(saga: readonly ToolSchema[], warlog: readonly ToolSchema[]): string[] {
  const byName = new Map(warlog.map((t) => [t.name, t] as const));
  return saga.flatMap((tool) => {
    const mine = byName.get(tool.name);
    return mine === undefined ? [`${tool.name}: missing tool`] : compareObject(tool.name, tool.inputSchema, mine.inputSchema, tool.name);
  });
}
