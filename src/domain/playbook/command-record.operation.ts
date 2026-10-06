/**
 * `command_record` (WL-18, WL-19): the agent records the outcome of a command it ran.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { COMMAND_PURPOSES, MEMORY_SCOPES } from '../memory/memory.schema.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { CommandRecordHandler } from './command-record.handler.ts';

/** Input schema. */
export const COMMAND_RECORD_INPUT = z.object({
  cmd: z.string().trim().min(1).max(2_000).describe('The command line, exactly as run (it identifies the command memory)'),
  outcome: z.enum(['ok', 'fail']).describe('Whether it worked'),
  exit_code: z.number().int().min(-1).max(255).optional().describe('Exit code'),
  error: z.string().max(1_000).optional().describe('The error observed on failure (short; secrets are rejected)'),
  purpose: z.enum(COMMAND_PURPOSES).optional().describe('Purpose, used when the command memory is created (default other)'),
  scope: z.enum(MEMORY_SCOPES).optional().describe('Scope of the command memory when it is created (default repo inside a repository)'),
});

/** Parsed input. */
export type CommandRecordInput = z.infer<typeof COMMAND_RECORD_INPUT>;

/**
 * Builds the definition.
 * @param fs - File system (activity files).
 * @param writers - Writer factory.
 * @returns The `command_record` operation.
 */
export function commandRecordOperation(fs: FileSystem, writers: WriterFactory): OperationDefinition {
  return {
    name: 'command_record',
    group: 'command',
    action: 'record',
    kind: 'command',
    input: COMMAND_RECORD_INPUT,
    description:
      'Record, deliberately, that a command worked or failed in this environment (OS and Node.js version). The command memory is created when missing (matched by the exact command line); its status is derived from the observations and the memory file is not rewritten.',
    examples: [{ cmd: 'npm run test:unit', outcome: 'fail', exit_code: 1, error: 'Cannot find module jest', purpose: 'test' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new CommandRecordHandler(fs, writers),
  };
}
