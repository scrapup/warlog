/**
 * Test helper: an operation context factory over in-memory fakes.
 */
import type { OperationContext, OperationContextFactory } from '../../src/core/mediator/operation-context.ts';
import { GLOBAL_ROOT, REPO_ROOT } from './store-fixture.ts';
import { FixedClock, FixedMachineId, SequentialIds } from './fakes/simple-fakes.ts';

/** Context factory returning fresh contexts over fixed fakes. */
export class FixtureContextFactory implements OperationContextFactory {
  /** Contexts created so far. */
  readonly created: OperationContext[] = [];
  /** Shared id generator. */
  readonly ids = new SequentialIds();

  /**
   * Creates a context.
   * @returns The context.
   */
  async create(): Promise<OperationContext> {
    const context: OperationContext = {
      roots: { global: GLOBAL_ROOT, repository: { root: REPO_ROOT, key: 'k', mode: 'in-repo', mainWorktree: REPO_ROOT }, warnings: [] },
      clock: new FixedClock(),
      ids: this.ids,
      machine: new FixedMachineId(),
      defaultProject: undefined,
      currentBranch: async () => 'main',
      activity: [],
      warnings: [],
    };
    this.created.push(context);
    return context;
  }
}
