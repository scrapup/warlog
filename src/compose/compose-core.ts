/**
 * Shared wiring of both entry points (plan §2.2): adapters, behaviors in pipeline order, the
 * registry, the mediator and the presenter. Only composition roots instantiate adapters.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { ExecuteDeps } from '../adapters/shared/execute-operation.ts';
import { LocalMachineId } from '../core/adapters/local-machine-id.ts';
import { NodeFileSystem } from '../core/adapters/node-file-system.ts';
import { ProcessEnv } from '../core/adapters/process-env.ts';
import { StderrJsonLogger, parseLogLevel } from '../core/adapters/stderr-json-logger.ts';
import { SystemClock } from '../core/adapters/system-clock.ts';
import { UlidGenerator } from '../core/adapters/ulid-generator.ts';
import { GitCliClient } from '../core/git/git-cli-client.ts';
import { resolveGitBinary } from '../core/git/git-binary.ts';
import { RepoLocator } from '../core/git/repo-locator.ts';
import { ActivityBehavior } from '../core/mediator/behaviors/activity.behavior.ts';
import { ContextBehavior } from '../core/mediator/behaviors/context.behavior.ts';
import { ErrorMappingBehavior } from '../core/mediator/behaviors/error-mapping.behavior.ts';
import { SecretGuardBehavior } from '../core/mediator/behaviors/secret-guard.behavior.ts';
import { ValidationBehavior } from '../core/mediator/behaviors/validation.behavior.ts';
import { Mediator } from '../core/mediator/mediator.ts';
import type { OperationDefinition } from '../core/mediator/operation-definition.ts';
import { OperationRegistry } from '../core/mediator/operation-registry.ts';
import { StoreContextFactory } from '../core/mediator/store-context-factory.ts';
import { Presenter } from '../core/presenter/presenter.ts';
import { PathGuard } from '../core/security/path-guard.ts';
import { SecretGuard } from '../core/security/secret-guard.ts';
import { ActivityLog } from '../core/storage/activity-log.ts';
import { StoreRootsResolver } from '../core/storage/store-roots.ts';
import { productOperations } from '../domain/operations.ts';
import type { DomainServices } from '../domain/operations.ts';

/** The wired call path plus the package version. */
export interface Core extends ExecuteDeps {
  /** Package version. */
  readonly version: string;
}

/** Builds registry content from the domain services. */
export type OperationsFactory = (services: DomainServices) => OperationDefinition[];

/**
 * Reads the package version from the `package.json` two levels above this file.
 * @returns The version.
 * @throws {Error} When `package.json` has no string version.
 */
export function readVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const version = typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'version') : undefined;
  if (typeof version !== 'string') {
    throw new Error('package.json has no version');
  }
  return version;
}

/**
 * Wires the call path.
 * @param operations - Registry content factory (default: the product operations).
 * @returns The core.
 */
export function composeCore(operations: OperationsFactory = productOperations): Core {
  const env = new ProcessEnv();
  const logger = new StderrJsonLogger(parseLogLevel(env.get('WARLOG_LOG_LEVEL')));
  const fs = new NodeFileSystem({ logger });
  const clock = new SystemClock();
  const git = new GitCliClient({ logger, binary: resolveGitBinary(process.platform, env.get('PATH'), existsSync) });
  const guard = new PathGuard(fs);
  const machine = new LocalMachineId({ fs, env, random: (count) => randomBytes(count) });
  const resolver = new StoreRootsResolver({ fs, env, git, guard, locator: new RepoLocator(git) });
  const contexts = new StoreContextFactory({ resolver, env, git, clock, ids: new UlidGenerator(clock), machine });
  const registry = new OperationRegistry(operations({ fs, logger }));
  const behaviors = [
    new ErrorMappingBehavior(logger, [[env.homeDir(), '~']]),
    new ContextBehavior(contexts),
    new ValidationBehavior(),
    new SecretGuardBehavior(new SecretGuard()),
    new ActivityBehavior(new ActivityLog({ fs, clock, machine, guard, logger })),
  ];
  return { registry, mediator: new Mediator(registry, behaviors), presenter: new Presenter(), version: readVersion() };
}
