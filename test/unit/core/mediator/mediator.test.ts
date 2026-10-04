import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { WarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { rootRedactions } from '../../../../src/core/mediator/behaviors/error-mapping.behavior.ts';
import { ValidationBehavior } from '../../../../src/core/mediator/behaviors/validation.behavior.ts';
import { Mediator } from '../../../../src/core/mediator/mediator.ts';
import type { OperationDefinition } from '../../../../src/core/mediator/operation-definition.ts';
import { OperationRegistry } from '../../../../src/core/mediator/operation-registry.ts';
import { buildPipeline } from '../../../../src/core/mediator/pipeline-factory.ts';
import { SecretGuard } from '../../../../src/core/security/secret-guard.ts';
import { FixtureContextFactory } from '../../../support/fixture-context.ts';
import { fixtureDeps } from '../../../support/fixture-deps.ts';
import { FIXTURE_OPERATIONS, fixtureOperation } from '../../../support/fixture-operations.ts';
import { GLOBAL_ROOT, REPO_ROOT, memoryStore } from '../../../support/store-fixture.ts';

const TOKEN = ['gh', 'p_'].join('') + 'a1B2'.repeat(9);

/**
 * Builds a mediator over the fixture registry.
 * @returns Mediator, context factory and store.
 */
function setup() {
  const deps = fixtureDeps();
  return { mediator: deps.mediator, contexts: deps.contexts, store: deps.store };
}

describe('Mediator pipeline', () => {
  it('[WL-35] runs a query through context and validation to the handler', async () => {
    const { mediator } = setup();
    expect(await mediator.send('fixture_echo', { text: 'hi', count: 3 })).toEqual({ result: { kind: 'object', value: { text: 'hi', count: 3 } }, warnings: [] });
  });

  it('[WL-40] rejects unknown keys and wrong types with every issue listed (VALIDATION)', async () => {
    await expect(setup().mediator.send('fixture_echo', { text: '', count: 'x', extra: 1 })).rejects.toMatchObject({
      code: 'VALIDATION',
      details: { issues: expect.arrayContaining([expect.objectContaining({ path: 'text' }), expect.objectContaining({ path: 'count' })]) },
    });
  });

  it('[WL-40] rejects an unknown operation as VALIDATION', async () => {
    await expect(setup().mediator.send('nope', {})).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('[WL-09] rejects command input containing a secret before the handler runs (SECRET_REJECTED)', async () => {
    const { mediator, contexts, store } = setup();
    await expect(mediator.send('fixture_note_create', { title: 'ok', meta: { token: TOKEN } })).rejects.toMatchObject({ code: 'SECRET_REJECTED' });
    expect(contexts.created[0]?.activity).toEqual([]);
    expect(store.fs.files.size).toBe(0);
  });

  it('[WL-09] does not scan query input (nothing is written)', async () => {
    expect((await setup().mediator.send('fixture_echo', { text: TOKEN })).result).toMatchObject({ kind: 'object' });
  });

  it('[WL-18] appends the activity of a successful command and reports a failed append as a warning', async () => {
    const { mediator, store } = setup();
    await mediator.send('fixture_note_create', { title: 'ok' });
    expect([...store.fs.files.keys()].some((k) => k.includes('/activity/'))).toBe(true);
    store.fs.appendFile = async () => Promise.reject(new Error('EIO'));
    expect((await mediator.send('fixture_note_create', { title: 'again' })).warnings).toEqual(['activity.not_recorded']);
  });

  it('[WL-36] dry run validates and guards without running the handler or writing activity', async () => {
    const { mediator, store } = setup();
    expect(await mediator.send('fixture_note_create', { title: 'ok' }, { dryRun: true })).toEqual({ result: undefined, warnings: [] });
    expect(store.fs.files.size).toBe(0);
    await expect(mediator.send('fixture_note_create', { title: '' }, { dryRun: true })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it.each(['NOT_FOUND', 'VALIDATION', 'CONFLICT', 'INVALID_FILE', 'NO_REPO_CONTEXT'])('[WL-40] keeps the %s category and redacts local paths', async (code) => {
    const error = await setup().mediator.send('fixture_fail', { code }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code, details: { where: '~/.warlog/x' } });
  });

  it('[WL-40] maps unexpected errors to INTERNAL without their message and logs codes only', async () => {
    const { mediator, store } = setup();
    const error = await mediator.send('fixture_fail', { code: 'UNEXPECTED' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'INTERNAL', message: 'internal error' });
    expect(store.logger.events).toEqual([
      { level: 'error', event: 'op.failed', fields: { op: 'fixture_fail', error_code: 'UNEXPECTED', error_name: 'TypeError' } },
    ]);
  });

  it('[WL-40] replaces the store roots of the call with placeholders', async () => {
    const failing: OperationDefinition = {
      ...fixtureOperation('fixture_fail'),
      handler: {
        handle: async () => {
          throw new WarlogError('NOT_FOUND', `missing ${GLOBAL_ROOT}/a`, { global: `${GLOBAL_ROOT}/x`, repo: `${REPO_ROOT}/y` });
        },
      },
    };
    const error = await fixtureDeps([failing]).mediator.send('fixture_fail', { code: 'NOT_FOUND' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: 'missing <store>/a', details: { global: '<store>/x', repo: '<repo-store>/y' } });
  });

  it('[WL-40] orders repository redactions before the global root', () => {
    const repository = { root: '/r/.warlog', key: 'k', mode: 'in-repo' as const, mainWorktree: '/r' };
    expect(rootRedactions(undefined)).toEqual([]);
    expect(rootRedactions({ global: '/g', repository, warnings: [] })).toEqual([
      ['/r/.warlog', '<repo-store>'],
      ['/r', '<repo>'],
      ['/g', '<store>'],
    ]);
  });

  it('[WL-09] logs a rejected secret as a warning with codes only', async () => {
    const { mediator, store } = setup();
    await mediator.send('fixture_note_create', { title: TOKEN }).catch(() => undefined);
    expect(store.logger.events).toEqual([
      { level: 'warn', event: 'op.failed', fields: { op: 'fixture_note_create', error_code: 'SECRET_REJECTED', error_name: 'WarlogError' } },
    ]);
  });

  it('builds the behaviors in the order of plan §2.2', () => {
    const store = memoryStore();
    const behaviors = buildPipeline({ logger: store.logger, redactions: [], contexts: new FixtureContextFactory(), secretGuard: new SecretGuard(), activity: store.activity });
    expect(behaviors.map((b) => b.constructor.name)).toEqual([
      'ErrorMappingBehavior',
      'ContextBehavior',
      'ValidationBehavior',
      'SecretGuardBehavior',
      'ActivityBehavior',
    ]);
  });

  it('fails clearly when the pipeline lacks the context behavior', async () => {
    const mediator = new Mediator(new OperationRegistry(FIXTURE_OPERATIONS), [new ValidationBehavior()]);
    await expect(mediator.send('fixture_echo', { text: 'x' })).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('OperationRegistry', () => {
  const base = FIXTURE_OPERATIONS[0] as OperationDefinition;

  it('lists operations by name', () => {
    expect(new OperationRegistry(FIXTURE_OPERATIONS).list().map((d) => d.name)).toEqual([
      'fixture_echo',
      'fixture_fail',
      'fixture_list',
      'fixture_note_create',
      'fixture_value',
    ]);
  });

  it.each<[string, Partial<OperationDefinition>]>([
    ['a non snake_case name', { name: 'Fixture-Echo' }],
    ['an empty description', { description: ' ' }],
    ['no example', { examples: [] }],
    ['an example not matching the schema', { examples: [{ text: 1 }] }],
  ])('[WL-37] rejects a definition with %s', (_label, change) => {
    expect(() => new OperationRegistry([{ ...base, ...change }])).toThrow(expect.objectContaining({ code: 'INTERNAL' }));
  });

  it('[WL-35] rejects duplicate names and CLI paths', () => {
    expect(() => new OperationRegistry([base, { ...base, name: 'other' }])).toThrow(expect.objectContaining({ code: 'INTERNAL' }));
    expect(() => new OperationRegistry([base, { ...base, action: 'other' }])).toThrow(expect.objectContaining({ code: 'INTERNAL' }));
  });

  it.each([['format'], ['fields'], ['file'], ['json_input'], ['validate'], ['help'], ['no_verify']])(
    '[WL-35] rejects a field named %s that clashes with an interface option',
    (key) => {
      const input = z.object({ [key]: z.string().optional() });
      expect(() => new OperationRegistry([{ ...base, input, examples: [{}] }])).toThrow(
        expect.objectContaining({ code: 'INTERNAL', message: expect.stringContaining(`fields reuse reserved names: ${key}`) }),
      );
    },
  );

  it.each([['mcp'], ['help']])('[WL-35] rejects an operation group named like the built-in command %s', (group) => {
    expect(() => new OperationRegistry([{ ...base, group }])).toThrow(expect.objectContaining({ code: 'INTERNAL', message: expect.stringContaining(`group ${group} is a reserved command name`) }));
  });

  it('[WL-35] rejects a top-level command named like an operation group', () => {
    expect(() => new OperationRegistry([base, { ...base, name: 'top', action: '' }])).toThrow(expect.objectContaining({ code: 'INTERNAL', details: { group: base.group } }));
  });

  it('accepts a schema made strict by the registry check', () => {
    expect(() => new OperationRegistry([{ ...base, name: 'loose', action: 'loose', input: z.object({ a: z.string() }), examples: [{ a: 'x' }] }])).not.toThrow();
  });
});
