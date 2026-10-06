/**
 * `issue_resolve` (WL-19): marks a known issue resolved.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { idField } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { IssueResolveHandler } from './issue-resolve.handler.ts';

/** Input schema. */
export const ISSUE_RESOLVE_INPUT = z.object({
  id: idField('Known-issue memory ID'),
  resolution: z.string().trim().min(1).max(10_000).describe('How it was resolved'),
  link: z.string().trim().min(1).max(2_000).optional().describe('A reference (URL, commit, ticket) kept as a link of the memory'),
});

/** Parsed input. */
export type IssueResolveInput = z.infer<typeof ISSUE_RESOLVE_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `issue_resolve` operation.
 */
export function issueResolveOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'issue_resolve',
    group: 'issue',
    action: 'resolve',
    kind: 'command',
    input: ISSUE_RESOLVE_INPUT,
    description: 'Mark a known_issue memory resolved, with how it was resolved and an optional reference. It leaves the playbook (the memory stays recallable).',
    examples: [{ id: '01J9Z8Q4N6V2M3K5H7G8F9D0D3', resolution: 'git paths normalized in GitCliClient', link: 'https://github.com/scrapup/warlog/pull/6' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new IssueResolveHandler(writers),
  };
}
