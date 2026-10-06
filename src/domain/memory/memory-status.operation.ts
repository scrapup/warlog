/**
 * `memory_mark_stale` and `memory_archive` (WL-17): explicit lifecycle decisions.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { MemoryStatusHandler } from './memory-status.handler.ts';

/** Input schema. */
export const MEMORY_STATUS_INPUT = z.object({
  id: idField('Memory ID'),
  reason: z.string().max(2_000).optional().describe('Why (kept in the memory)'),
});

/** Parsed input. */
export type MemoryStatusInput = z.infer<typeof MEMORY_STATUS_INPUT>;

/**
 * Builds `memory_mark_stale`.
 * @param writers - Writer factory.
 * @returns The operation.
 */
export function memoryMarkStaleOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'memory_mark_stale',
    group: 'memory',
    action: 'mark-stale',
    kind: 'command',
    input: MEMORY_STATUS_INPUT,
    description: 'Mark an active memory stale (it may be outdated; it is still recalled, flagged by its status). Only an explicit call changes a memory.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0D1', reason: 'the build moved to pnpm' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new MemoryStatusHandler(writers, { to: 'stale', from: ['active'], verb: 'marked stale' }),
  };
}

/**
 * Builds `memory_archive`.
 * @param writers - Writer factory.
 * @returns The operation.
 */
export function memoryArchiveOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'memory_archive',
    group: 'memory',
    action: 'archive',
    kind: 'command',
    input: MEMORY_STATUS_INPUT,
    description: 'Archive an active or stale memory: it leaves recall, listings and the playbook (the file is kept). Only an explicit call changes a memory.',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0D1' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new MemoryStatusHandler(writers, { to: 'archived', from: ['active', 'stale'], verb: 'archived' }),
  };
}
