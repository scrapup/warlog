/**
 * Shared wiring of both entry points (plan §2.2): adapters, the behavior pipeline, the registry,
 * the mediator and the presenter. Only composition roots instantiate adapters.
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
import type { Redaction } from '../core/errors/path-redactor.ts';
import { GitCliClient } from '../core/git/git-cli-client.ts';
import { resolveGitBinary } from '../core/git/git-binary.ts';
import { RepoLocator } from '../core/git/repo-locator.ts';
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
import { StoreRootsResolver } from '../core/storage/store-roots.ts';
import { productOperations } from '../domain/operations.ts';
import type { OperationsFactory } from '../domain/operations.ts';

/** The wired call path plus the package version. */
export interface Core extends ExecuteDeps {
  /** Package version. */
  readonly version: string;
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
 * @param operations - Registry content factory (default: the product operations).
 * @returns The core.
 */
export function composeCore(operations: OperationsFactory = productOperations): Core {
  const env = new ProcessEnv();
  const logger = composeLogger(env);
  const fs = new NodeFileSystem({ logger });
  const clock = new SystemClock();
  const git = new GitCliClient({ logger, binary: resolveGitBinary(process.platform, env.get('PATH'), existsSync) });
  const guard = new PathGuard(fs);
  const machine = new LocalMachineId({ fs, env, random: (count) => randomBytes(count) });
  const resolver = new StoreRootsResolver({ fs, env, git, guard, locator: new RepoLocator(git) });
  const contexts = new StoreContextFactory({ resolver, env, git, clock, ids: new UlidGenerator(clock), machine });
  const registry = new OperationRegistry(operations({ fs, logger }));
  const redactions = staticRedactions(env);
  const behaviors = buildPipeline({ logger, redactions, contexts, secretGuard: new SecretGuard(), activity: new ActivityLog({ fs, clock, machine, guard, logger }) });
  return { registry, mediator: new Mediator(registry, behaviors), presenter: new Presenter(), logger, redactions, version: readVersion() };
}
