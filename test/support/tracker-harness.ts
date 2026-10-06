/**
 * Test helper: the product registry behind the real mediator and pipeline, over an in-memory
 * store. `lazy` reads the disk on every call (command-line profile); `live` keeps one index for the
 * session (MCP profile, without watcher).
 */
import { docRepositoryFactory } from '../../src/domain/doc/doc.repository.ts';
import { resolve } from 'node:path';
import { IndexBuilder } from '../../src/core/index/index-builder.ts';
import { IndexProvider } from '../../src/core/index/index-provider.ts';
import type { IndexMode } from '../../src/core/index/index-provider.ts';
import { Mediator } from '../../src/core/mediator/mediator.ts';
import type { ContextRequest, OperationContext, OperationContextFactory } from '../../src/core/mediator/operation-context.ts';
import { OperationRegistry } from '../../src/core/mediator/operation-registry.ts';
import type { OperationResult } from '../../src/core/mediator/operation-result.ts';
import { buildPipeline } from '../../src/core/mediator/pipeline-factory.ts';
import type { StoreView } from '../../src/core/ports/store-view.port.ts';
import { PathGuard } from '../../src/core/security/path-guard.ts';
import { entityStoreFactory } from '../../src/core/storage/entity-store.ts';
import { SecretGuard } from '../../src/core/security/secret-guard.ts';
import { varRepositoryFactory } from '../../src/domain/var/var.repository.ts';
import { productOperations } from '../../src/domain/operations.ts';
import type { DomainDeps } from '../../src/domain/operations.ts';
import { SequentialIds } from './fakes/simple-fakes.ts';
import { memoryStore } from './store-fixture.ts';
import type { MemoryStore } from './store-fixture.ts';

/** Options of {@link trackerHarness}. */
export interface HarnessOptions {
  /** Index profile (default `lazy`). */
  readonly mode?: IndexMode;
  /** Whether a repository root exists (default true). */
  readonly withRepository?: boolean;
}

/** A parsed activity record. */
export type ActivityRecord = Record<string, unknown>;

/** The harness. */
export interface TrackerHarness extends MemoryStore {
  /** Ids issued to new entities. */
  readonly ids: SequentialIds;
  /** `WARLOG_PROJECT` of the next calls. */
  defaultProject: string | undefined;
  /** Active git branch of the next calls. */
  branch: string | undefined;
  /** Top level of the working tree of the next calls. */
  topLevel: string | undefined;
  /** Contexts created so far. */
  readonly contexts: OperationContext[];
  /** Warnings returned so far. */
  readonly warnings: string[];
  /** Warning codes every new context starts with (e.g. `repo.local_scope`). */
  contextWarnings: string[];
  /**
   * Calls an operation through the mediator.
   * @param name - Operation name.
   * @param input - Raw input.
   * @returns The result.
   */
  call(name: string, input?: Record<string, unknown>): Promise<OperationResult>;
  /**
   * Calls an operation returning an object.
   * @param name - Operation name.
   * @param input - Raw input.
   * @returns The value.
   */
  obj(name: string, input?: Record<string, unknown>): Promise<Record<string, unknown>>;
  /**
   * Calls an operation returning a list.
   * @param name - Operation name.
   * @param input - Raw input.
   * @returns The rows.
   */
  rows(name: string, input?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  /**
   * Builds a fresh view of the store.
   * @returns The view.
   */
  view(): Promise<StoreView>;
  /**
   * Reads every activity record written so far.
   * @returns Records in file order.
   */
  activityRecords(): ActivityRecord[];
  /**
   * The domain collaborators.
   * @returns Deps.
   */
  deps(): DomainDeps;
}

/**
 * Builds the harness.
 * @param options - Profile and repository presence.
 * @returns The harness.
 */
export function trackerHarness(options: HarnessOptions = {}): TrackerHarness {
  const store = memoryStore(options.withRepository === false ? { withRepository: false } : {});
  const ids = new SequentialIds();
  const guard = new PathGuard(store.fs);
  const builder = new IndexBuilder({ fs: store.fs, clock: store.clock });
  const indexes = new IndexProvider({ fs: store.fs, builder, guard, logger: store.logger, mode: options.mode ?? 'lazy' });
  const deps: DomainDeps = { fs: store.fs, logger: store.logger, entities: entityStoreFactory(store.fs, guard), vars: varRepositoryFactory(store.fs, guard), docs: docRepositoryFactory(store.fs, guard) };
  const harness = {
    ...store,
    ids,
    defaultProject: undefined as string | undefined,
    branch: 'main' as string | undefined,
    topLevel: (options.withRepository === false ? undefined : resolve('/src/warlog')) as string | undefined,
    contexts: [] as OperationContext[],
    warnings: [] as string[],
    contextWarnings: [] as string[],
  };
  const contexts: OperationContextFactory = {
    create: async (request: ContextRequest): Promise<OperationContext> => {
      const context: OperationContext = {
        roots: store.roots,
        clock: store.clock,
        ids,
        machine: store.machine,
        runtime: { os: 'linux', node: '22' },
        defaultProject: harness.defaultProject,
        currentBranch: async () => harness.branch,
        topLevel: async () => harness.topLevel,
        cwd: harness.topLevel ?? resolve('/outside'),
        index: indexes.sourceFor(store.roots, request.load, request.operation),
        activity: [],
        warnings: [...harness.contextWarnings],
      };
      harness.contexts.push(context);
      return context;
    },
  };
  const registry = new OperationRegistry(productOperations(deps));
  const mediator = new Mediator(registry, buildPipeline({ logger: store.logger, redactions: [], contexts, secretGuard: new SecretGuard(), activity: store.activity }));
  const call = async (name: string, input: Record<string, unknown> = {}): Promise<OperationResult> => {
    const response = await mediator.send(name, input);
    harness.warnings.push(...response.warnings);
    if (response.result === undefined) {
      throw new Error(`${name} returned no result`);
    }
    return response.result;
  };
  return Object.assign(harness, {
    call,
    obj: async (name: string, input: Record<string, unknown> = {}) => {
      const result = await call(name, input);
      if (result.kind !== 'object') {
        throw new Error(`${name} returned ${result.kind}`);
      }
      return { ...result.value };
    },
    rows: async (name: string, input: Record<string, unknown> = {}) => {
      const result = await call(name, input);
      if (result.kind !== 'list') {
        throw new Error(`${name} returned ${result.kind}`);
      }
      return result.rows.map((r) => ({ ...r }));
    },
    view: async () => (await builder.build(store.roots)).index,
    activityRecords: () =>
      [...store.fs.files.entries()]
        .filter(([path]) => path.includes('/activity/') && path.endsWith('.jsonl'))
        .flatMap(([, content]) => content.trim().split('\n').filter((l) => l !== ''))
        .map((line) => JSON.parse(line) as ActivityRecord),
    deps: () => deps,
  });
}
