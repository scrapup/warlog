/**
 * The product operation registry content (WL-35): every operation exposed by both interfaces is
 * listed here.
 */
import type { OperationDefinition } from '../core/mediator/operation-definition.ts';
import type { FileSystem } from '../core/ports/file-system.port.ts';
import type { Logger } from '../core/ports/logger.port.ts';
import type { EntityStoreFactory } from '../core/storage/entity-store.ts';
import type { VarRepositoryFactory } from './var/var.repository.ts';
import { commentAddOperation } from './comment/comment-add.operation.ts';
import { commentListOperation } from './comment/comment-list.operation.ts';
import { commentDeleteOperation } from './comment/comment-delete.operation.ts';
import { commentRestoreOperation } from './comment/comment-restore.operation.ts';
import { epicArchiveOperation } from './epic/epic-archive.operation.ts';
import { epicCreateOperation } from './epic/epic-create.operation.ts';
import { epicListOperation } from './epic/epic-list.operation.ts';
import { epicUpdateOperation } from './epic/epic-update.operation.ts';
import { doctorOperation } from './health/doctor.operation.ts';
import { noteSaveOperation } from './note/note-save.operation.ts';
import { noteListOperation } from './note/note-list.operation.ts';
import { noteSearchOperation } from './note/note-search.operation.ts';
import { noteDeleteOperation } from './note/note-delete.operation.ts';
import { noteRestoreOperation } from './note/note-restore.operation.ts';
import { projectCreateOperation } from './project/project-create.operation.ts';
import { projectListOperation } from './project/project-list.operation.ts';
import { projectUpdateOperation } from './project/project-update.operation.ts';
import { varDeleteOperation } from './var/var-delete.operation.ts';
import { varGetOperation } from './var/var-get.operation.ts';
import { varListOperation } from './var/var-list.operation.ts';
import { varSetOperation } from './var/var-set.operation.ts';
import { writerFactory } from './shared/writer-factory.ts';
import { storyArchiveOperation } from './story/story-archive.operation.ts';
import { storyCreateOperation } from './story/story-create.operation.ts';
import { storyGetOperation } from './story/story-get.operation.ts';
import { storyListOperation } from './story/story-list.operation.ts';
import { storyUpdateOperation } from './story/story-update.operation.ts';
import { taskCreateOperation } from './task/task-create.operation.ts';
import { taskGetOperation } from './task/task-get.operation.ts';
import { taskListOperation } from './task/task-list.operation.ts';
import { taskUpdateOperation } from './task/task-update.operation.ts';
import { taskDeleteOperation } from './task/task-delete.operation.ts';
import { taskRestoreOperation } from './task/task-restore.operation.ts';
import { taskReorderOperation } from './task/task-reorder.operation.ts';
import { subtaskCreateOperation } from './subtask/subtask-create.operation.ts';
import { subtaskUpdateOperation } from './subtask/subtask-update.operation.ts';
import { subtaskDeleteOperation } from './subtask/subtask-delete.operation.ts';
import { subtaskReorderOperation } from './subtask/subtask-reorder.operation.ts';
import { taskBatchUpdateOperation } from './task/task-batch-update.operation.ts';
import { taskLockDescriptionOperation } from './task/task-lock-description.operation.ts';
import { templateCreateOperation } from './template/template-create.operation.ts';
import { templateListOperation } from './template/template-list.operation.ts';
import { templateUpdateOperation } from './template/template-update.operation.ts';
import { templateDeleteOperation } from './template/template-delete.operation.ts';
import { templateApplyOperation } from './template/template-apply.operation.ts';
import { activityLogOperation } from './tracker/activity-log.operation.ts';
import { trackerDashboardOperation } from './tracker/tracker-dashboard.operation.ts';
import { trackerExportOperation } from './tracker/tracker-export.operation.ts';
import { trackerImportOperation } from './tracker/tracker-import.operation.ts';
import { trackerInitOperation } from './tracker/tracker-init.operation.ts';
import { trackerNextOperation } from './tracker/tracker-next.operation.ts';
import { trackerSearchOperation } from './tracker/tracker-search.operation.ts';
import { trackerSessionDiffOperation } from './tracker/tracker-session-diff.operation.ts';

/** Ports available to the domain operations (each group takes what it needs). */
export interface DomainDeps {
  /** File system. */
  readonly fs: FileSystem;
  /** Logger. */
  readonly logger: Logger;
  /** Opens the entity store of a call's roots. */
  readonly entities: EntityStoreFactory;
  /** Opens the variable repository of a call's roots. */
  readonly vars: VarRepositoryFactory;
}

/** Builds the registry content from the domain collaborators. */
export type OperationsFactory = (deps: DomainDeps) => OperationDefinition[];

/**
 * Builds the product operations.
 * @param deps - Domain collaborators.
 * @returns The registry content.
 */
export function productOperations(deps: DomainDeps): OperationDefinition[] {
  const writers = writerFactory(deps.entities);
  return [
    doctorOperation(deps.logger),
    trackerInitOperation(writers),
    trackerDashboardOperation(deps.fs),
    trackerNextOperation(),
    trackerSearchOperation(),
    trackerSessionDiffOperation(deps.fs),
    trackerExportOperation(),
    trackerImportOperation(writers),
    activityLogOperation(deps.fs),
    projectCreateOperation(writers),
    projectListOperation(),
    projectUpdateOperation(writers),
    epicCreateOperation(writers),
    epicListOperation(),
    epicUpdateOperation(writers),
    epicArchiveOperation(writers),
    storyCreateOperation(writers),
    storyGetOperation(),
    storyListOperation(),
    storyUpdateOperation(writers),
    storyArchiveOperation(writers),
    taskCreateOperation(writers),
    taskGetOperation(),
    taskListOperation(),
    taskUpdateOperation(writers),
    taskDeleteOperation(writers),
    taskRestoreOperation(writers),
    taskReorderOperation(writers),
    taskBatchUpdateOperation(writers),
    taskLockDescriptionOperation(writers),
    subtaskCreateOperation(writers),
    subtaskUpdateOperation(writers),
    subtaskDeleteOperation(writers),
    subtaskReorderOperation(writers),
    noteSaveOperation(writers),
    noteListOperation(),
    noteSearchOperation(),
    noteDeleteOperation(writers),
    noteRestoreOperation(writers),
    commentAddOperation(writers),
    commentListOperation(),
    commentDeleteOperation(writers),
    commentRestoreOperation(writers),
    templateCreateOperation(writers),
    templateListOperation(),
    templateUpdateOperation(writers),
    templateDeleteOperation(writers),
    templateApplyOperation(writers),
    varSetOperation(deps.vars),
    varGetOperation(deps.vars),
    varListOperation(),
    varDeleteOperation(deps.vars),
  ];
}
