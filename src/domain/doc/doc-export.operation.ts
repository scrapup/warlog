/**
 * `doc_export` (WL-68): writes a registered document, with its images, to a folder on disk,
 * again without passing the content through the agent. Image links go back to their original
 * relative destinations.
 */
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { VarRepositoryFactory } from '../var/var.repository.ts';
import { DocReader } from './doc-reader.ts';
import type { DocRepository, DocRepositoryFactory } from './doc.repository.ts';
import type { DocLocation } from './doc.schema.ts';
import { ImportPathPolicy } from './import-path-policy.ts';
import { MAX_ASSET_BYTES } from './import/asset-collector.ts';
import { applyReplacements } from './import/link-rewriter.ts';
import { scanMarkdown } from './markdown-scanner.ts';

/** Input schema. */
const EXPORT_INPUT = z.object({
  id: z.string().min(1).describe('Document id'),
  path: z.string().min(1).describe('Destination folder (inside the repository or an allowed root)'),
  version: z.number().int().min(1).optional().describe('A kept version (default: the current content)'),
  overwrite: z.boolean().default(false).describe('Replace an existing file'),
});

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
    input: EXPORT_INPUT,
    description: 'Write a registered document and its images to a folder on disk. warlog does the copy; nothing passes through your context. Refuses to overwrite unless overwrite=true.',
    examples: [{ id: '01J0000000000000000000000A', path: 'out/specs' }],
    defaultFormat: 'yaml',
    load: 'point',
    handler: {
      async handle(input: z.infer<typeof EXPORT_INPUT>, context: OperationContext): Promise<OperationResult> {
        const repo = docs(context);
        const reader = new DocReader(fs, repo);
        const found = await reader.find(input.id);
        const content = await reader.read(found, context, input.version);
        const area = found.area;
        const policy = await ImportPathPolicy.forCall(fs, vars, context, area);
        const dir = await policy.resolve(resolve(context.cwd, input.path), 'write');
        const target = `${dir}/${basename(found.meta.source_path)}`;
        if (!input.overwrite && (await fs.stat(target)) !== undefined) {
          throw new WarlogError('CONFLICT', `${target} exists; pass overwrite=true to replace it`, { reason: 'exists' });
        }
        const prefix = `assets/${found.kind}/`;
        const back = scanMarkdown(content.text).images.filter((i) => i.dest.startsWith(prefix)).map((i) => ({ start: i.destStart, end: i.destEnd, text: i.dest.slice(prefix.length) }));
        await fs.writeFileAtomic(target, applyReplacements(content.text, back));
        const kept = input.version !== undefined && input.version !== found.meta.version;
        const written = kept ? [] : await Promise.all(found.meta.assets.map((a) => copyAsset(fs, repo, found, a.path, dir)));
        return { kind: 'object', value: { id: found.meta.id, path: target, assets: written.length } };
      },
    },
  };
}

/**
 * Copies one stored asset next to the exported document.
 * @param fs - File system.
 * @param repo - Document repository.
 * @param found - The document.
 * @param path - Asset path relative to the source folder.
 * @param dir - Destination folder.
 * @returns The destination path.
 */
async function copyAsset(fs: FileSystem, repo: DocRepository, found: DocLocation, path: string, dir: string): Promise<string> {
  const bytes = await fs.readBinary(await repo.paths.asset(found, path), MAX_ASSET_BYTES);
  const to = `${dir}/${path}`;
  await fs.writeFileAtomic(to, bytes ?? new Uint8Array());
  return to;
}
