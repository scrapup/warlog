/**
 * Activity records of variable writes (plan §3.6): the entity is the variable name; repository
 * and project variables are logged in the repository root, global ones in the global root.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { ActivityAction } from '../../core/storage/activity-log.ts';
import type { VarLocation } from './var.repository.ts';

/**
 * Queues an activity record about a variable.
 * @param context - Call context.
 * @param location - The variable.
 * @param action - What happened.
 * @param summary - Short summary (names only, never values).
 */
export function recordVarActivity(context: OperationContext, location: VarLocation, action: ActivityAction, summary: string): void {
  const repo = location.scope === 'global' ? undefined : context.roots.repository;
  context.activity.push({
    root: repo?.root ?? context.roots.global,
    input: {
      action,
      entity_type: 'var',
      entity_id: location.name,
      ...(location.projectId === undefined ? {} : { project_id: location.projectId }),
      ...(repo === undefined ? {} : { repo_key: repo.key }),
      summary,
      extra: { scope: location.scope },
    },
  });
}
