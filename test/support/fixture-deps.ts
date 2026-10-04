/**
 * Test helper: the shared call path (registry, mediator, presenter) over the fixture operations.
 */
import type { ExecuteDeps } from '../../src/adapters/shared/execute-operation.ts';
import type { Redaction } from '../../src/core/errors/path-redactor.ts';
import { Mediator } from '../../src/core/mediator/mediator.ts';
import type { OperationDefinition } from '../../src/core/mediator/operation-definition.ts';
import { OperationRegistry } from '../../src/core/mediator/operation-registry.ts';
import { buildPipeline } from '../../src/core/mediator/pipeline-factory.ts';
import { Presenter } from '../../src/core/presenter/presenter.ts';
import { SecretGuard } from '../../src/core/security/secret-guard.ts';
import { FixtureContextFactory } from './fixture-context.ts';
import { FIXTURE_OPERATIONS } from './fixture-operations.ts';
import { memoryStore } from './store-fixture.ts';
import type { MemoryStore } from './store-fixture.ts';

/** Fixture call path and its observable fakes. */
export interface FixtureDeps extends ExecuteDeps {
  /** Context factory (records created contexts). */
  readonly contexts: FixtureContextFactory;
  /** In-memory store. */
  readonly store: MemoryStore;
}

/**
 * Builds the call path over fixture operations.
 * @param operations - Registry content (default: the fixture operations).
 * @returns Registry, mediator, presenter and fakes.
 */
export function fixtureDeps(operations: readonly OperationDefinition[] = FIXTURE_OPERATIONS): FixtureDeps {
  const store = memoryStore();
  const contexts = new FixtureContextFactory();
  const registry = new OperationRegistry(operations);
  const logger = store.logger;
  const redactions: Redaction[] = [['/home/alice', '~']];
  const behaviors = buildPipeline({ logger, redactions, contexts, secretGuard: new SecretGuard(), activity: store.activity });
  return { registry, mediator: new Mediator(registry, behaviors), presenter: new Presenter(), logger, redactions, contexts, store };
}
