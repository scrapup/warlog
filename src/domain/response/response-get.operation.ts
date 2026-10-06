/**
 * `response_get` (WL-31): one response with its answers and the questions it answered.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import { ResponseGetHandler } from './response-get.handler.ts';

/** Input schema. */
export const RESPONSE_GET_INPUT = z.object({ id: idField('Response ID') });

/** Parsed input. */
export type ResponseGetInput = z.infer<typeof RESPONSE_GET_INPUT>;

/**
 * Builds the definition.
 * @returns The `response_get` operation.
 */
export function responseGetOperation(): OperationDefinition {
  return {
    name: 'response_get',
    group: 'response',
    action: 'get',
    kind: 'query',
    input: RESPONSE_GET_INPUT,
    description: 'Get a response: its answers, the copy of the questions it answered, and the rendered answers as content.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0E1' }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'id',
    handler: new ResponseGetHandler(),
  };
}
