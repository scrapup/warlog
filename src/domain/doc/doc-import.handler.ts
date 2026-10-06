/**
 * Registers documents by path.
 */
import { resolve } from 'node:path';
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import { isInside } from '../../core/security/path-guard.ts';
import { SecretGuard } from '../../core/security/secret-guard.ts';
import type { VarRepositoryFactory } from '../var/var.repository.ts';
import type { DocImportInput } from './doc-import.operation.ts';
import { ImportPathPolicy } from './import-path-policy.ts';
import { DocumentPlanner } from './import/document-planner.ts';
import { DocumentWriter } from './import/document-writer.ts';
import type { DocArea } from './doc.schema.ts';
import type { DocRepositoryFactory } from './doc.repository.ts';

/** Handles `doc_import`. */
export class DocImportHandler implements OperationHandler<DocImportInput> {
  /** File system. */
  private readonly fs: FileSystem;
  /** Document repository factory. */
  private readonly docs: DocRepositoryFactory;
  /** Variable repository factory. */
  private readonly vars: VarRepositoryFactory;

  /**
   * Creates the handler.
   * @param fs - File system.
   * @param docs - Document repository factory.
   * @param vars - Variable repository factory.
   */
  constructor(fs: FileSystem, docs: DocRepositoryFactory, vars: VarRepositoryFactory) {
    this.fs = fs;
    this.docs = docs;
    this.vars = vars;
  }

  /**
   * Plans, then (unless `validate_only`) writes.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ area, epic, opportunity, mode, documents }`.
   * @throws {WarlogError} `VALIDATION` (every problem listed), `SECRET_REJECTED`, `NOT_FOUND`, `NO_REPO_CONTEXT`.
   */
  async handle(input: DocImportInput, context: OperationContext): Promise<OperationResult> {
    const area: DocArea = input.area ?? (context.roots.repository === undefined ? 'global' : 'repo');
    const repo = this.docs(context);
    const topLevel = await context.topLevel();
    const policy = await ImportPathPolicy.forCall(this.fs, this.vars, context, area);
    const real = await policy.resolve(resolve(context.cwd, input.path), 'read');
    this.checkReference(input, area, real, topLevel === undefined ? undefined : await this.fs.realpath(topLevel));
    const plan = await new DocumentPlanner(this.fs, repo, new SecretGuard()).plan({ real, given: input.path, area, mode: input.mode, epic: input.epic, opportunity: input.opportunity, kind: input.kind, topLevel: topLevel === undefined ? undefined : await this.fs.realpath(topLevel) });
    const documents = await new DocumentWriter(this.fs, repo).apply(plan, context, input.version);
    return { kind: 'object', value: { area, epic: plan.epic, opportunity: plan.opportunity, mode: plan.mode, documents } };
  }

  /**
   * Reference mode is for repository files only and cannot keep versions (WL-73).
   * @param input - Input.
   * @param area - Area.
   * @param real - Real path of the source.
   * @param top - Real path of the repository top level.
   * @throws {WarlogError} `VALIDATION` when the combination is not allowed.
   */
  private checkReference(input: DocImportInput, area: DocArea, real: string, top: string | undefined): void {
    if (input.mode !== 'reference') {
      return;
    }
    if (area !== 'repo' || top === undefined || !isInside(top, real)) {
      throw new WarlogError('VALIDATION', 'reference mode is allowed only for files inside the repository, in the repository area', { field: 'mode', reason: 'reference_outside_repository' });
    }
    if (input.version) {
      throw new WarlogError('VALIDATION', 'version cannot be combined with mode reference: no content is stored', { field: 'version' });
    }
  }
}
