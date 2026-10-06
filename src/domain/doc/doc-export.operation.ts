/**
 * `doc_export` (WL-68): writes a registered document, with its images, to a folder on disk,
 * again without passing the content through the agent. Image links go back to their original
 * relative destinations.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { VarRepositoryFactory } from '../var/var.repository.ts';
import { DocExportHandler } from './doc-export.handler.ts';
import type { DocRepositoryFactory } from './doc.repository.ts';

/** Input schema. */
export const DOC_EXPORT_INPUT = z.object({
  id: z.string().min(1).describe('Document id'),
  path: z.string().min(1).describe('Destination folder (inside the repository or an allowed root)'),
  version: z.number().int().min(1).optional().describe('A kept version (default: the current content)'),
  overwrite: z.boolean().default(false).describe('Replace an existing file'),
});

/** Parsed input. */
export type DocExportInput = z.infer<typeof DOC_EXPORT_INPUT>;

/**
 * Builds `doc_export`.
 * @param fs - File system.
 * @param docs - Repository factory.
 * @param vars - Variable repository factory.
 * @returns The operation.
 */
export function docExportOperation(fs: FileSystem, docs: DocRepositoryFactory, vars: VarRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_export',
    group: 'doc',
    action: 'export',
    kind: 'command',
    input: DOC_EXPORT_INPUT,
    description: 'Write a registered document and its images to a folder on disk. warlog does the copy; nothing passes through your context. Refuses to overwrite unless overwrite=true.',
    examples: [{ id: '01J0000000000000000000000A', path: 'out/specs' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: new DocExportHandler(fs, docs, vars),
  };
}
