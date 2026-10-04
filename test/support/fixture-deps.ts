/**
 * Test helper: the shared call path (registry, mediator, presenter) over the fixture operations.
 */
import { ActivityBehavior } from '../../src/core/mediator/behaviors/activity.behavior.ts';
import { ContextBehavior } from '../../src/core/mediator/behaviors/context.behavior.ts';
import { ErrorMappingBehavior } from '../../src/core/mediator/behaviors/error-mapping.behavior.ts';
import { SecretGuardBehavior } from '../../src/core/mediator/behaviors/secret-guard.behavior.ts';
import { ValidationBehavior } from '../../src/core/mediator/behaviors/validation.behavior.ts';
import { Mediator } from '../../src/core/mediator/mediator.ts';
import type { OperationDefinition } from '../../src/core/mediator/operation-definition.ts';
import { OperationRegistry } from '../../src/core/mediator/operation-registry.ts';
import { Presenter } from '../../src/core/presenter/presenter.ts';
import { SecretGuard } from '../../src/core/security/secret-guard.ts';
import type { ExecuteDeps } from '../../src/adapters/shared/execute-operation.ts';
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
  const behaviors = [
    new ErrorMappingBehavior(store.logger, [['/home/alice', '~']]),
    new ContextBehavior(contexts),
    new ValidationBehavior(),
    new SecretGuardBehavior(new SecretGuard()),
    new ActivityBehavior(store.activity),
  ];
  return { registry, mediator: new Mediator(registry, behaviors), presenter: new Presenter(), contexts, store };
}
