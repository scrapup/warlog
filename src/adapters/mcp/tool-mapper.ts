/**
 * Maps registry entries to MCP tool descriptors (plan §4.3): same name, description and input
 * schema as the command line (WL-35), plus the shared output options.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { OUTPUT_OPTIONS } from '../shared/output-options.ts';

/** JSON schema of a tool input (MCP requires an object schema). */
export interface ToolInputSchema {
  /** Always `object`. */
  readonly type: 'object';
  /** Property schemas. */
  readonly properties: Record<string, unknown>;
  /** Required properties. */
  readonly required?: string[];
  /** Unknown keys are rejected. */
  readonly additionalProperties: false;
  /** Other JSON-schema keywords are allowed. */
  readonly [key: string]: unknown;
}

/** MCP tool descriptor. */
export interface ToolDescriptor {
  /** Tool name (= operation name). */
  readonly name: string;
  /** Description. */
  readonly description: string;
  /** Input schema. */
  readonly inputSchema: ToolInputSchema;
}

/** Properties and required list of a JSON object schema. */
interface ObjectSchemaParts {
  /** Property schemas. */
  readonly properties: Record<string, unknown>;
  /** Required property names. */
  readonly required: string[];
}

/**
 * Converts a zod object to a JSON object schema without the `$schema` marker.
 * @param schema - Zod object.
 * @returns The JSON schema properties and required list.
 */
function objectSchema(schema: z.ZodObject): ObjectSchemaParts {
  const json: Record<string, unknown> = z.toJSONSchema(schema.strict(), { io: 'input' });
  const properties = json['properties'];
  const required = json['required'];
  return {
    properties: typeof properties === 'object' && properties !== null ? (properties as Record<string, unknown>) : {},
    required: Array.isArray(required) ? required.map(String) : [],
  };
}

/**
 * Builds the tool descriptor of an operation.
 * @param def - Operation definition.
 * @returns The descriptor.
 */
export function toToolDescriptor(def: OperationDefinition): ToolDescriptor {
  const input = objectSchema(def.input);
  const output = objectSchema(OUTPUT_OPTIONS);
  const inputSchema: ToolInputSchema = {
    type: 'object',
    properties: { ...input.properties, ...output.properties },
    additionalProperties: false,
    ...(input.required.length > 0 ? { required: input.required } : {}),
  };
  return { name: def.name, description: def.description, inputSchema };
}
