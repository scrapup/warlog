/**
 * Where a call looks for variables (WL-25): project (when known), repository (inside a
 * repository) and global, most specific first.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import { isUlid } from '../../core/security/identifiers.ts';
import type { VarLocation, VarScope } from './var.repository.ts';

/**
 * The project a call refers to: the explicit id, or `WARLOG_PROJECT` when it is an id (a project
 * name needs the full index, which point operations do not load).
 * @param context - Call context.
 * @param explicit - `project_id` parameter.
 * @returns The project id, when known.
 */
export function projectOf(context: OperationContext, explicit: string | undefined): string | undefined {
  const configured = context.defaultProject;
  return explicit ?? (configured !== undefined && isUlid(configured) ? configured : undefined);
}

/**
 * Location of a write or delete.
 * @param context - Call context.
 * @param scope - Scope.
 * @param name - Variable name.
 * @param projectId - `project_id` parameter.
 * @returns The location.
 * @throws {WarlogError} `VALIDATION` for project scope without a project.
 */
export function targetOf(context: OperationContext, scope: VarScope, name: string, projectId: string | undefined): VarLocation {
  if (scope !== 'project') {
    return { scope, name };
  }
  const project = projectOf(context, projectId);
  if (project === undefined) {
    throw new WarlogError('VALIDATION', 'project scope needs project_id (or WARLOG_PROJECT set to a project id)', { field: 'project_id' });
  }
  return { scope, name, projectId: project };
}

/**
 * Scopes in effect for a read, most specific first.
 * @param context - Call context.
 * @param name - Variable name.
 * @param projectId - `project_id` parameter.
 * @returns Locations: project (when known), repository (inside a repository), global.
 */
export function levelsOf(context: OperationContext, name: string, projectId: string | undefined): VarLocation[] {
  const project = projectOf(context, projectId);
  const repo = context.roots.repository !== undefined;
  return [
    ...(repo && project !== undefined ? [{ scope: 'project' as const, name, projectId: project }] : []),
    ...(repo ? [{ scope: 'repo' as const, name }] : []),
    { scope: 'global' as const, name },
  ];
}
