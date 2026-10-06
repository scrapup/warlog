/**
 * `doc_import` (WL-57..WL-65, WL-68, WL-69, WL-73): registers a file or an opportunity folder by
 * path; the content never passes through the agent, the answer is a short summary.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { VarRepositoryFactory } from '../var/var.repository.ts';
import { AREA_FIELD, DOC_MODES, DOC_SLUG, KIND_FIELD } from './doc.schema.ts';
import { DocImportHandler } from './doc-import.handler.ts';
import type { DocRepositoryFactory } from './doc.repository.ts';

/** Input schema. */
export const DOC_IMPORT_INPUT = z.object({
  path: z.string().min(1).describe('A Markdown file or an opportunity folder (docs/specs/<epic>/<opportunity>)'),
  area: AREA_FIELD.optional().describe('repo (default inside a repository) or global'),
  mode: z.enum(DOC_MODES).default('copy').describe('copy (default) stores the content; reference stores metadata and fingerprint only (repository files)'),
  epic: DOC_SLUG.optional().describe('Epic slug (default: parent folder name)'),
  opportunity: DOC_SLUG.optional().describe('Opportunity slug (default: folder name)'),
  kind: KIND_FIELD.optional().describe('Kind of a single file (default: inferred from the file name)'),
  version: z.boolean().default(false).describe('Keep the replaced content as a numbered version (copy mode)'),
});

/** Parsed input. */
export type DocImportInput = z.infer<typeof DOC_IMPORT_INPUT>;

/**
 * Builds the definition.
 * @param fs - File system.
 * @param docs - Document repository factory.
 * @param vars - Variable repository factory.
 * @returns The `doc_import` operation.
 */
export function docImportOperation(fs: FileSystem, docs: DocRepositoryFactory, vars: VarRepositoryFactory): OperationDefinition {
  return {
    name: 'doc_import',
    group: 'doc',
    action: 'import',
    kind: 'command',
    input: DOC_IMPORT_INPUT,
    description:
      'Register a documentation file or a whole opportunity folder by path. warlog reads and copies the Markdown and its images itself (nothing passes through your context), validates everything first (image links, size limits, secrets, SDD sections) and writes nothing when anything fails. Re-registering replaces the document; version=true keeps the previous content as a numbered version. mode=reference stores only metadata and a fingerprint of a repository file.',
    examples: [{ path: 'docs/specs/warlog/spec.md', epic: 'warlog', opportunity: 'core' }, { path: 'docs/specs/warlog', version: true }],
    defaultFormat: 'yaml',
    load: 'point',
    positional: 'path',
    handler: new DocImportHandler(fs, docs, vars),
  };
}
