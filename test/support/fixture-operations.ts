/**
 * Fixture operations exercising every result kind and error category through the mediator and
 * both transports (US-95). Not part of the product registry.
 */
import { z } from 'zod';
import { WarlogError } from '../../src/core/errors/warlog-error.ts';
import type { OperationContext } from '../../src/core/mediator/operation-context.ts';
import type { OperationDefinition } from '../../src/core/mediator/operation-definition.ts';
import type { OperationResult } from '../../src/core/mediator/operation-result.ts';

const ECHO = z.object({ text: z.string().min(1).describe('Text to echo'), count: z.number().int().min(0).optional().describe('Repetitions') });
const CREATE = z.object({
  title: z.string().min(1).describe('Note title'),
  description: z.string().optional().describe('Note body'),
  tags: z.array(z.string()).optional().describe('Tags'),
  meta: z.record(z.string(), z.unknown()).optional().describe('Structured metadata'),
});
const LIST = z.object({ limit: z.number().int().min(1).max(100).optional().describe('Rows'), done: z.boolean().optional().describe('Filter') });
const VALUE = z.object({ name: z.string().min(1).describe('Variable name') });
const FAIL = z.object({ code: z.enum(['NOT_FOUND', 'VALIDATION', 'CONFLICT', 'INVALID_FILE', 'NO_REPO_CONTEXT', 'UNEXPECTED']).describe('Error to raise') });

/**
 * Builds a handler from a function.
 * @param fn - Handler body.
 * @returns The handler object.
 */
function handler<I>(fn: (input: I, context: OperationContext) => Promise<OperationResult>): { handle: typeof fn } {
  return { handle: fn };
}

/** The fixture registry content. */
export const FIXTURE_OPERATIONS: OperationDefinition[] = [
  {
    name: 'fixture_echo',
    group: 'fixture',
    action: 'echo',
    kind: 'query',
    input: ECHO,
    description: 'Echoes a text.',
    examples: [{ text: 'hello', count: 2 }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: handler<z.infer<typeof ECHO>>(async (input) => ({ kind: 'object', value: { text: input.text, count: input.count ?? 1 } })),
  },
  {
    name: 'fixture_note_create',
    group: 'fixture',
    action: 'note-create',
    kind: 'command',
    input: CREATE,
    description: 'Creates a note (in memory) and records activity.',
    examples: [{ title: 'Deploy notes', description: 'Body', tags: ['ops'] }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: handler<z.infer<typeof CREATE>>(async (input, context) => {
      const id = context.ids.next();
      const now = context.clock.now().toISOString();
      context.activity.push({ root: context.roots.global, input: { action: 'created', entity_type: 'note', entity_id: id, summary: 'Note created' } });
      const data = { id, type: 'note', rev: 1, created_at: now, updated_at: now, machine: await context.machine.get(), title: input.title, tags: input.tags ?? [], meta: input.meta ?? {} };
      return { kind: 'entity', record: { data, body: input.description ?? '' } };
    }),
  },
  {
    name: 'fixture_list',
    group: 'fixture',
    action: 'list',
    kind: 'query',
    input: LIST,
    description: 'Lists fixed rows.',
    examples: [{ limit: 2 }],
    defaultFormat: 'table',
    load: 'full',
    handler: handler<z.infer<typeof LIST>>(async (input) => {
      const rows = [
        { id: 'A', title: 'First | pipe', done: true },
        { id: 'B', title: 'Second\nline', done: false },
        { id: 'C', title: 'Third', done: true },
      ].filter((r) => input.done === undefined || r.done === input.done);
      const limited = rows.slice(0, input.limit ?? rows.length);
      return limited.length < rows.length ? { kind: 'list', rows: limited, nextCursor: 'next' } : { kind: 'list', rows: limited };
    }),
  },
  {
    name: 'fixture_value',
    group: 'fixture',
    action: 'value',
    kind: 'query',
    input: VALUE,
    description: 'Returns a scalar value.',
    examples: [{ name: 'flag' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: handler<z.infer<typeof VALUE>>(async (input) => ({ kind: 'scalar', value: input.name === 'flag' ? false : input.name })),
  },
  {
    name: 'fixture_fail',
    group: 'fixture',
    action: 'fail',
    kind: 'query',
    input: FAIL,
    description: 'Raises an error of the requested category.',
    examples: [{ code: 'NOT_FOUND' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: handler<z.infer<typeof FAIL>>(async (input) => {
      if (input.code === 'UNEXPECTED') {
        throw new TypeError('boom at /home/alice/secret-path');
      }
      throw new WarlogError(input.code, `fixture ${input.code}`, { reason: 'fixture', where: '/home/alice/.warlog/x' });
    }),
  },
];

/**
 * Returns one fixture operation.
 * @param name - Operation name.
 * @returns The definition.
 * @throws {Error} When the fixture does not exist.
 */
export function fixtureOperation(name: string): OperationDefinition {
  const def = FIXTURE_OPERATIONS.find((d) => d.name === name);
  if (def === undefined) {
    throw new Error(`no fixture operation ${name}`);
  }
  return def;
}
