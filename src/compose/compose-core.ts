/**
 * Shared wiring of both entry points (plan §2.2): adapters, the behavior pipeline, the registry,
 * the mediator and the presenter. Only composition roots instantiate adapters.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { ExecuteDeps } from '../adapters/shared/execute-operation.ts';
import { LocalMachineId } from '../core/adapters/local-machine-id.ts';
import { NodeFileSystem } from '../core/adapters/node-file-system.ts';
import { NodeRecursiveWatcher } from '../core/adapters/node-recursive-watcher.ts';
import { NodeTimers } from '../core/adapters/node-timers.ts';
import { ProcessEnv } from '../core/adapters/process-env.ts';
import { StderrJsonLogger, parseLogLevel } from '../core/adapters/stderr-json-logger.ts';
import { SystemClock } from '../core/adapters/system-clock.ts';
import { UlidGenerator } from '../core/adapters/ulid-generator.ts';
import type { Redaction } from '../core/errors/path-redactor.ts';
import type { WarlogError } from '../core/errors/warlog-error.ts';
import { GitCliClient } from '../core/git/git-cli-client.ts';
import { resolveGitBinary } from '../core/git/git-binary.ts';
import { RepoLocator } from '../core/git/repo-locator.ts';
import { IndexBuilder } from '../core/index/index-builder.ts';
import { IndexProvider } from '../core/index/index-provider.ts';
import type { IndexMode } from '../core/index/index-provider.ts';
import { WatcherService } from '../core/index/watcher-service.ts';
import { Mediator } from '../core/mediator/mediator.ts';
import { OperationRegistry } from '../core/mediator/operation-registry.ts';
import { buildPipeline } from '../core/mediator/pipeline-factory.ts';
import { StoreContextFactory } from '../core/mediator/store-context-factory.ts';
import type { Env } from '../core/ports/env.port.ts';
import type { Logger } from '../core/ports/logger.port.ts';
import { Presenter } from '../core/presenter/presenter.ts';
import { PathGuard } from '../core/security/path-guard.ts';
import { isPlainRecord } from '../core/security/plain-record.ts';
import { SecretGuard } from '../core/security/secret-guard.ts';
import { ActivityLog } from '../core/storage/activity-log.ts';
import { entityStoreFactory } from '../core/storage/entity-store.ts';
import { StoreRootsResolver } from '../core/storage/store-roots.ts';
import { varRepositoryFactory } from '../domain/var/var.repository.ts';
import { productOperations } from '../domain/operations.ts';
import type { OperationsFactory } from '../domain/operations.ts';

/** The wired call path plus the package version. */
export interface Core extends ExecuteDeps {
  /** Package version. */
  readonly version: string;
  /**
   * Builds the live index of the working directory's roots now (MCP start-up, plan §3.7).
   * @returns When built.
   * @throws {WarlogError} `INTERNAL` in the command-line profile; any error of the build.
   */
  warmIndex(): Promise<void>;
  /** Stops the live index's watcher (MCP shutdown). */
  close(): void;
}

/** Options of {@link composeCore}. */
export interface ComposeOptions {
  /** Registry content factory (default: the product operations). */
  readonly operations?: OperationsFactory;
  /** Process profile: `lazy` (command line, default) or `live` (MCP server with watcher). */
  readonly index?: IndexMode;
}

/** Fields read from `package.json`. */
interface PackageManifest {
  /** Package version. */
  readonly version: string;
}

/**
 * Tells whether a parsed `package.json` has a string version.
 * @param value - Parsed JSON.
 * @returns `true` when `value.version` is a string.
 */
function isPackageManifest(value: unknown): value is PackageManifest {
  return isPlainRecord(value) && typeof value['version'] === 'string';
}

/**
 * Reads the package version from the `package.json` two levels above this file.
 * @returns The version.
 * @throws {Error} When `package.json` has no string version.
 */
export function readVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  if (!isPackageManifest(raw)) {
    throw new Error('package.json has no version');
  }
  return raw.version;
}

/**
 * Local path prefixes hidden from every error leaving the process.
 * @param env - Environment.
 * @returns The home directory redaction.
 */
export function staticRedactions(env: Env): Redaction[] {
  return [[env.homeDir(), '~']];
}

/**
 * The process logger: JSON lines on standard error at `WARLOG_LOG_LEVEL`.
 * @param env - Environment.
 * @returns The logger.
 */
export function composeLogger(env: Env): Logger {
  return new StderrJsonLogger(parseLogLevel(env.get('WARLOG_LOG_LEVEL')));
}

/**
 * Wires the call path.
 * @param options - Registry content and process profile.
 * @returns The core.
 */
export function composeCore(options: ComposeOptions = {}): Core {
  const operations = options.operations ?? productOperations;
  const env = new ProcessEnv();
  const logger = composeLogger(env);
  const fs = new NodeFileSystem({ logger });
  const clock = new SystemClock();
  const git = new GitCliClient({ logger, binary: resolveGitBinary(process.platform, env.get('PATH'), existsSync) });
  const guard = new PathGuard(fs);
  const machine = new LocalMachineId({ fs, env, random: (count) => randomBytes(count) });
  const resolver = new StoreRootsResolver({ fs, env, git, guard, locator: new RepoLocator(git) });
  const builder = new IndexBuilder({ fs, clock });
  const indexes = new IndexProvider({
    fs,
    builder,
    guard,
    logger,
    mode: options.index ?? 'lazy',
    onBuilt: (index, roots) => {
      const watcher = new WatcherService({ watcher: new NodeRecursiveWatcher(), builder, index, roots, logger, timers: new NodeTimers(), clock });
      watcher.start();
      return () => watcher.stop();
    },
  });
  const contexts = new StoreContextFactory({
    resolver,
    env,
    git,
    clock,
    ids: new UlidGenerator(clock),
    machine,
    indexes: (roots, request) => indexes.sourceFor(roots, request.load, request.operation),
  });
  const registry = new OperationRegistry(operations({ fs, logger, entities: entityStoreFactory(fs, guard), vars: varRepositoryFactory(fs, guard) }));
  const redactions = staticRedactions(env);
  const behaviors = buildPipeline({ logger, redactions, contexts, secretGuard: new SecretGuard(), activity: new ActivityLog({ fs, clock, machine, guard, logger }) });
  /**
   * Builds the index of the working directory's roots.
   * @returns When built.
   */
  const warmIndex = async (): Promise<void> => {
    await indexes.ensure(await resolver.resolve(env.cwd()));
  };
  return { registry, mediator: new Mediator(registry, behaviors), presenter: new Presenter(), logger, redactions, version: readVersion(), warmIndex, close: () => indexes.close() };
}
