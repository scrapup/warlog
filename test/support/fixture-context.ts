/**
 * Test helper: an operation context factory over in-memory fakes.
 */
import { LiveIndexSource, pointOnly } from '../../src/core/index/index-source.ts';
import { StoreIndex } from '../../src/core/index/store-index.ts';
import type { ContextRequest, OperationContext, OperationContextFactory } from '../../src/core/mediator/operation-context.ts';
import type { IndexSource } from '../../src/core/ports/store-view.port.ts';
import { FixedClock, FixedMachineId, SequentialIds } from './fakes/simple-fakes.ts';
import { GLOBAL_ROOT, REPO_ROOT } from './store-fixture.ts';

/** Context factory returning fresh contexts over fixed fakes. */
export class FixtureContextFactory implements OperationContextFactory {
  /** Contexts created so far. */
  readonly created: OperationContext[] = [];
  /** Shared id generator. */
  readonly ids = new SequentialIds();
  /** Index source handed to every context. */
  index: IndexSource = new LiveIndexSource(new StoreIndex());

  /**
   * Creates a context (point operations get a point-only index, as in production).
   * @param request - Operation and load mode.
   * @returns The context.
   */
  async create(request: ContextRequest = { operation: 'fixture', load: 'full' }): Promise<OperationContext> {
    const context: OperationContext = {
      roots: { global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo', mainWorktree: REPO_ROOT }, warnings: [] },
      clock: new FixedClock(),
      ids: this.ids,
      machine: new FixedMachineId(),
      runtime: { os: 'linux', node: '22' },
      defaultProject: undefined,
      currentBranch: async () => 'main',
      index: request.load === 'point' ? pointOnly(this.index, request.operation) : this.index,
      activity: [],
      warnings: [],
    };
    this.created.push(context);
    return context;
  }
}
