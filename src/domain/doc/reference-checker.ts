/**
 * Finds referenced documents (WL-73) whose file changed or disappeared, for `doctor` (WL-45).
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { sha256Hex } from '../../core/security/sha256.ts';
import { MAX_OPEN_FILES, mapLimit } from '../../core/index/bounded.ts';
import type { DocRepositoryFactory } from './doc.repository.ts';
import type { FoundDocument } from './doc.schema.ts';
import { resolveReference } from './reference-path.ts';
import { MAX_DOC_BYTES } from './import/document-planner.ts';

/** A referenced document that needs attention. */
export interface ReferenceProblem {
  /** Document id. */
  readonly id: string;
  /** Source path as registered (relative to the repository). */
  readonly path: string;
  /** `changed` (fingerprint differs) or `broken` (see `reason`). */
  readonly status: 'changed' | 'broken';
  /** Why a broken reference cannot be read: `missing`, `outside` the repository or `too_large`. */
  readonly reason?: 'missing' | 'outside' | 'too_large';
}

/** Lists the reference problems of a call. */
export type ReferenceChecker = (context: OperationContext) => Promise<ReferenceProblem[]>;

/**
 * Checks one referenced document against its registered fingerprint.
 * @param fs - File system.
 * @param top - Top level of the repository.
 * @param found - The referenced document.
 * @returns The problem, or `undefined` when the file is as registered.
 */
async function check(fs: FileSystem, top: string, found: FoundDocument): Promise<ReferenceProblem | undefined> {
  const base = { id: found.meta.id, path: found.meta.source_path };
  const target = await resolveReference(fs, top, found.meta.source_path);
  if ('problem' in target) {
    return { ...base, status: 'broken', reason: target.problem };
  }
  const text = await fs.readFileBounded(target.path, MAX_DOC_BYTES).catch(() => undefined);
  if (text === undefined) {
    return { ...base, status: 'broken', reason: 'too_large' };
  }
  return sha256Hex(text) === found.meta.source_sha256 ? undefined : { ...base, status: 'changed' };
}

/**
 * Builds the checker. Files are checked with bounded concurrency.
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
    const checked = await mapLimit(found, MAX_OPEN_FILES, (d) => check(fs, top, d));
    return checked.filter((p): p is ReferenceProblem => p !== undefined);
  };
}
