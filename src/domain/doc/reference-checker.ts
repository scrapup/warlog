/**
 * Finds referenced documents (WL-73) whose file changed or disappeared, for `doctor` (WL-45).
 */
import { join } from 'node:path';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { sha256Hex } from '../../core/security/sha256.ts';
import type { DocRepositoryFactory } from './doc.repository.ts';
import { MAX_DOC_BYTES } from './import/document-planner.ts';

/** A referenced document that needs attention. */
export interface ReferenceProblem {
  /** Document id. */
  readonly id: string;
  /** Source path relative to the repository. */
  readonly path: string;
  /** `changed` (fingerprint differs) or `broken` (moved or deleted). */
  readonly status: 'changed' | 'broken';
}

/** Lists the reference problems of a call. */
export type ReferenceChecker = (context: OperationContext) => Promise<ReferenceProblem[]>;

/**
 * Builds the checker.
 * @param fs - File system.
 * @param docs - Document repository factory.
 * @returns The checker.
 */
export function referenceChecker(fs: FileSystem, docs: DocRepositoryFactory): ReferenceChecker {
  return async (context) => {
    const top = await context.topLevel();
    if (top === undefined) {
      return [];
    }
    const found = (await docs(context).documents('repo')).filter((d) => d.meta.mode === 'reference');
    const checked = await Promise.all(
      found.map(async (d): Promise<ReferenceProblem | undefined> => {
        const text = await fs.readFileBounded(join(top, ...d.meta.source_path.split('/')), MAX_DOC_BYTES).catch(() => undefined);
        const status = text === undefined ? 'broken' : sha256Hex(text) === d.meta.source_sha256 ? undefined : 'changed';
        return status === undefined ? undefined : { id: d.meta.id, path: d.meta.source_path, status };
      }),
    );
    return checked.filter((p): p is ReferenceProblem => p !== undefined);
  };
}
