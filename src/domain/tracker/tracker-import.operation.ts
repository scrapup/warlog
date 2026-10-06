/**
 * `tracker_import` (WL-14): imports an export of the current tracker or of warlog as a new
 * project, remapping every id.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import { TrackerImportHandler } from './tracker-import.handler.ts';

/** Input schema. */
export const TRACKER_IMPORT_INPUT = z.object({
  data: z.record(z.string(), z.unknown()).describe('Export JSON (tracker_export of the current tracker or of warlog, format_version 1.0–1.3)'),
});

/** Parsed input. */
export type TrackerImportInput = z.infer<typeof TRACKER_IMPORT_INPUT>;

/**
 * Builds the definition.
 * @param writers - Writer factory.
 * @returns The `tracker_import` operation.
 */
export function trackerImportOperation(writers: WriterFactory): OperationDefinition {
  return {
    name: 'tracker_import',
    group: 'tracker',
    action: 'import',
    kind: 'command',
    input: TRACKER_IMPORT_INPUT,
    description:
      'Import an export (from the current tracker or from warlog) as a new project: every id is remapped; the whole payload is validated first and nothing is written when any record is invalid.',
    examples: [{ data: { format_version: '1.3', project: { name: 'imported', epics: [{ name: 'E', tasks: [{ title: 'T' }] }] }, notes: [] } }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new TrackerImportHandler(writers),
  };
}
