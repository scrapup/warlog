/**
 * Production context factory (plan §4.1): resolves the store roots of the working directory on
 * every call, so a long-running MCP server follows repository and configuration changes.
 */
import type { WarlogError } from '../errors/warlog-error.ts';
import type { Clock } from '../ports/clock.port.ts';
import type { Env } from '../ports/env.port.ts';
import type { GitClient } from '../ports/git-client.port.ts';
import type { IdGenerator } from '../ports/id-generator.port.ts';
import type { MachineIdProvider } from '../ports/machine-id.port.ts';
import type { StoreRoots } from '../storage/store-roots.ts';
import type { OperationContext, OperationContextFactory } from './operation-context.ts';

/** Resolves the store roots of a directory. */
export interface RootsResolver {
  /**
   * Resolves the roots.
   * @param cwd - Working directory.
   * @returns Roots and warnings.
   * @throws {WarlogError} When the configuration is invalid.
   */
  resolve(cwd: string): Promise<StoreRoots>;
}

/** Collaborators of {@link StoreContextFactory}. */
export interface StoreContextFactoryDeps {
  /** Store roots resolver. */
  readonly resolver: RootsResolver;
  /** Environment (working directory, `WARLOG_PROJECT`). */
  readonly env: Env;
  /** Read-only git client. */
  readonly git: GitClient;
  /** Clock. */
  readonly clock: Clock;
  /** Identifier generator. */
  readonly ids: IdGenerator;
  /** Machine id. */
  readonly machine: MachineIdProvider;
}

/** Builds contexts from the process environment. */
export class StoreContextFactory implements OperationContextFactory {
  /** Collaborators. */
  private readonly deps: StoreContextFactoryDeps;

  /**
   * Creates the factory.
   * @param deps - Collaborators.
   */
  constructor(deps: StoreContextFactoryDeps) {
    this.deps = deps;
  }

  /**
   * Creates the context of one call.
   * @returns The context.
   * @throws {WarlogError} When the store roots cannot be resolved.
   */
  async create(): Promise<OperationContext> {
    const cwd = this.deps.env.cwd();
    const roots = await this.deps.resolver.resolve(cwd);
    const project = this.deps.env.get('WARLOG_PROJECT');
    return {
      roots,
      clock: this.deps.clock,
      ids: this.deps.ids,
      machine: this.deps.machine,
      defaultProject: project === undefined || project.trim() === '' ? undefined : project,
      currentBranch: () => this.deps.git.currentBranch(cwd),
      activity: [],
      warnings: [...roots.warnings],
    };
  }
}
