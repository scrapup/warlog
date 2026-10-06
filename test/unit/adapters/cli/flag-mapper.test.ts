import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { convertFlagValue, fieldSpecs, toFlagName } from '../../../../src/adapters/cli/flag-mapper.ts';
import type { FieldSpec } from '../../../../src/adapters/cli/flag-mapper.ts';
import { renderOperationHelp } from '../../../../src/adapters/cli/help-renderer.ts';
import { fixtureOperation } from '../../../support/fixture-operations.ts';

const SCHEMA = z.object({
  due_date: z.string().describe('Due date'),
  priority: z.enum(['low', 'high']).default('low').describe('Priority'),
  sizes: z.array(z.number()).optional(),
  states: z.array(z.enum(['a', 'b'])).optional(),
  nested: z.array(z.object({ x: z.number() })).optional(),
  urgent: z.boolean().nullable().optional(),
  meta: z.object({ k: z.string() }).optional(),
  frozen: z.array(z.string()).readonly(),
  either: z.union([z.string(), z.number()]).optional(),
  shape: z.union([z.object({ a: z.string() }), z.array(z.string())]).optional(),
});

/**
 * Returns the spec of one key.
 * @param key - Input key.
 * @returns The spec.
 * @throws {Error} When absent.
 */
function spec(key: string): FieldSpec {
  const found = fieldSpecs(SCHEMA).find((s) => s.key === key);
  if (found === undefined) {
    throw new Error(key);
  }
  return found;
}

describe('flag mapper', () => {
  it('[WL-35] derives kebab-case flags, kinds, required flags, defaults and choices from the schema', () => {
    expect(toFlagName('due_date')).toBe('due-date');
    expect(spec('due_date')).toMatchObject({ flag: 'due-date', kind: 'string', required: true, description: 'Due date' });
    expect(spec('priority')).toMatchObject({ kind: 'enum', required: false, defaultValue: 'low', choices: ['low', 'high'], typeLabel: 'low | high' });
    expect(spec('sizes')).toMatchObject({ kind: 'number-array', typeLabel: 'number[]', description: '' });
    expect(spec('states')).toMatchObject({ kind: 'string-array' });
    expect(spec('nested')).toMatchObject({ kind: 'complex', typeLabel: 'object[]' });
    expect(spec('urgent')).toMatchObject({ kind: 'boolean', required: false });
    expect(spec('meta')).toMatchObject({ kind: 'complex', typeLabel: 'object' });
    expect(spec('frozen')).toMatchObject({ kind: 'string-array', required: true });
    expect(spec('either')).toMatchObject({ kind: 'typed-text', typeLabel: 'json | text' });
    expect(spec('shape')).toMatchObject({ kind: 'complex', typeLabel: 'union' });
  });

  it('[WL-36] converts flag text to the field type, leaving invalid text for validation', () => {
    expect(convertFlagValue(spec('sizes'), ['1,2', '3'])).toEqual([1, 2, 3]);
    expect(convertFlagValue(spec('sizes'), ['x'])).toEqual(['x']);
    expect(convertFlagValue(spec('states'), 'a,b')).toEqual(['a', 'b']);
    expect(convertFlagValue(spec('urgent'), 'maybe')).toBe('maybe');
    expect(convertFlagValue(spec('due_date'), '2026-01-01')).toBe('2026-01-01');
    const count = { ...spec('due_date'), kind: 'number' as const };
    expect(convertFlagValue(count, ' ')).toBe(' ');
    expect(convertFlagValue(count, 4)).toBe(4);
    expect(convertFlagValue({ ...count, kind: 'number-array' }, [5])).toEqual([5]);
  });

  it('[WL-28] typed-text flags keep the type written as JSON and never guess otherwise', () => {
    const either = spec('either');
    expect(convertFlagValue(either, 'true')).toBe(true);
    expect(convertFlagValue(either, '12')).toBe(12);
    expect(convertFlagValue(either, '"012"')).toBe('012');
    expect(convertFlagValue(either, '[1,2]')).toEqual([1, 2]);
    expect(convertFlagValue(either, '{"a":1}')).toEqual({ a: 1 });
    for (const text of ['no', 'off', '012', 'null', 'plain words', '1.', '']) {
      expect(convertFlagValue(either, text)).toBe(text);
    }
    expect(convertFlagValue(either, true)).toBe(true);
  });
});

describe('help renderer', () => {
  it('[WL-37] shows defaults, boolean flags and operations without parameters', () => {
    const help = renderOperationHelp({ ...fixtureOperation('fixture_echo'), input: SCHEMA, examples: [] });
    expect(help).toContain('--priority <value>');
    expect(help).toContain('"low"');
    expect(help).toContain('--urgent ');
    expect(help).toContain('Example input file');
    const empty = renderOperationHelp({ ...fixtureOperation('fixture_echo'), input: z.object({}) });
    expect(empty).toContain('Parameters:\n  (none)');
  });
});
