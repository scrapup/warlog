/**
 * `tracker_init` (WL-10): returns the existing project, or creates the first one.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DESCRIPTION, TITLE } from '../shared/fields.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TrackerInitHandler } from './tracker-init.handler.ts';

/** Input schema. */
export const TRACKER_INIT_INPUT = z.object({
  project_name: TITLE.optional().describe('Name of the first project (created when the store has none)'),
  project_description: DESCRIPTION.describe('Description of the first project'),
});

/** Parsed input. */
export type TrackerInitInput = z.infer<typeof TRACKER_INIT_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `tracker_init` operation.
 */
export function trackerInitOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'tracker_init',
    group: 'tracker',
    action: 'init',
    kind: 'command',
    input: TRACKER_INIT_INPUT,
    description: 'Initialize the tracker: returns the existing project when the store has one, otherwise creates the first project from project_name.',
    examples: [{ project_name: 'checkout-revamp', project_description: 'Checkout flow rewrite' }],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new TrackerInitHandler(writers),
  };
}
