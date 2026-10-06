/**
 * `playbook` (WL-20): how to work in this repository.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { limitField } from '../shared/fields.ts';
import { PlaybookHandler } from './playbook.handler.ts';

/** Input schema. */
export const PLAYBOOK_INPUT = z.object({
  topic: z.string().trim().min(1).max(200).optional().describe('Words to focus on (e.g. test, logs, deploy, windows); matching is literal. Default: everything'),
  limit: limitField(20).describe('Most entries per section'),
});

/** Parsed input. */
export type PlaybookInput = z.infer<typeof PLAYBOOK_INPUT>;

/**
 * Builds the definition.
 * @param fs - File system (activity files).
 * @returns The `playbook` operation.
 */
export function playbookOperation(fs: FileSystem): OperationDefinition {
  return {
    name: 'playbook',
    group: 'playbook',
    action: '',
    positional: 'topic',
    kind: 'query',
    input: PLAYBOOK_INPUT,
    description:
      'How to run, test, debug and read logs here: runbooks (with steps), commands grouped by status in this environment (works, fails, flaky, unverified) with known errors, open known issues and patterns; repository memories and global ones. Optionally focused by topic.',
    examples: [{ topic: 'test' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new PlaybookHandler(fs),
  };
}
