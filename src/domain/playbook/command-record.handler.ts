/**
 * Records a command outcome as per-machine activity (WL-18); creates the command memory the
 * first time a command is seen.
 */
import type { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { FileSystem } from '../../core/ports/file-system.port.ts';
import type { IndexedEntity } from '../../core/ports/store-view.port.ts';
import { freshActivity } from '../memory/fresh-activity.ts';
import type { MemoryScope } from '../memory/memory.schema.ts';
import { bySpecificityThenRecency, scopeOfMemory } from '../memory/memory-rows.ts';
import { text } from '../shared/rows.ts';
import type { WriterFactory } from '../shared/writer-factory.ts';
import type { CommandRecordInput } from './command-record.operation.ts';
import { deriveStatuses } from './command-status-deriver.ts';

/** Longest title of a command memory. */
const TITLE_CHARS = 80;

/**
 * The command memory for an exact command line (repository first, then global).
 * @param memories - Live memories.
 * @param cmd - Command line.
 * @param scope - Required scope, when asked.
 * @returns The memory, when any.
 */
function findCommand(memories: readonly IndexedEntity[], cmd: string, scope: MemoryScope | undefined): IndexedEntity | undefined {
  return memories
    .filter((m) => text(m, 'kind') === 'command' && text(m, 'cmd') === cmd && text(m, 'status') !== 'archived' && (scope === undefined || scopeOfMemory(m) === scope))
    .sort(bySpecificityThenRecency)[0];
}

/** The environment of an observation. */
interface ObservedEnv {
  /** Operating system. */
  readonly os: string;
  /** Node.js major version. */
  readonly node: string;
}

/** What an observation is about. */
interface Observed {
  /** Command memory id. */
  readonly memoryId: string;
  /** Scope of the memory. */
  readonly scope: MemoryScope;
  /** Environment of the observation. */
  readonly env: ObservedEnv;
}

/** Handles `command_record`. */
export class CommandRecordHandler implements OperationHandler<CommandRecordInput> {
  /** File system (activity files). */
  private readonly fs: FileSystem;
  /** Writer factory. */
  private readonly writers: WriterFactory;

  /**
   * Creates the handler.
   * @param fs - File system.
   * @param writers - Writer factory.
   */
  constructor(fs: FileSystem, writers: WriterFactory) {
    this.fs = fs;
    this.writers = writers;
  }

  /**
   * Records the observation.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ memory_id, created, outcome, environment, status }`.
   * @throws {WarlogError} `NO_REPO_CONTEXT` for repository scope outside a repository.
   */
  async handle(input: CommandRecordInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    const existing = findCommand(view.ofType('memory').filter((m) => !m.deleted), input.cmd, input.scope);
    const scope: MemoryScope = existing === undefined ? (input.scope ?? (context.roots.repository === undefined ? 'global' : 'repo')) : scopeOfMemory(existing);
    const memoryId = existing?.id ?? (await this.createMemory(context, input, scope));
    const env = { os: context.runtime.os, node: context.runtime.node };
    this.queueObservation(context, input, { memoryId, scope, env });
    const previous = (await freshActivity(this.fs, context)).commands.get(memoryId) ?? [];
    const observation = { ts: context.clock.now().toISOString(), machine: '', outcome: input.outcome, exitCode: input.exit_code, env };
    const here = deriveStatuses([...previous, observation]).find((s) => s.os === env.os && s.node === env.node);
    return { kind: 'object', value: { memory_id: memoryId, created: existing === undefined, outcome: input.outcome, environment: env, status: here?.status } };
  }

  /**
   * Creates the command memory of a command seen for the first time.
   * @param context - Call context.
   * @param input - Input.
   * @param scope - Scope of the new memory.
   * @returns The new memory id.
   * @throws {WarlogError} `NO_REPO_CONTEXT` for repository scope outside a repository.
   */
  private async createMemory(context: OperationContext, input: CommandRecordInput, scope: MemoryScope): Promise<string> {
    const title = input.cmd.slice(0, TITLE_CHARS);
    const record = await this.writers(context).create(
      { type: 'memory', id: context.ids.next(), scope },
      { scope, kind: 'command', title, status: 'active', cmd: input.cmd, purpose: input.purpose ?? 'other', tags: [] },
      '',
      `Command memory '${title}' created by its first observation`,
    );
    return String(record.data['id']);
  }

  /**
   * Queues the `command_observed` activity record (per machine, never a memory rewrite).
   * @param context - Call context.
   * @param input - Input.
   * @param target - Memory, scope and environment observed.
   */
  private queueObservation(context: OperationContext, input: CommandRecordInput, target: Observed): void {
    const repo = target.scope === 'repo' ? context.roots.repository : undefined;
    context.activity.push({
      root: repo?.root ?? context.roots.global,
      input: {
        action: 'command_observed',
        entity_type: 'memory',
        entity_id: target.memoryId,
        ...(repo === undefined ? {} : { repo_key: repo.key }),
        summary: `Command '${input.cmd.slice(0, TITLE_CHARS)}' ${input.outcome === 'ok' ? 'worked' : 'failed'} on ${target.env.os}`,
        extra: {
          cmd_memory_id: target.memoryId,
          outcome: input.outcome,
          ...(input.exit_code === undefined ? {} : { exit_code: input.exit_code }),
          ...(input.error === undefined ? {} : { error: input.error }),
          env: target.env,
        },
      },
    });
  }
}
