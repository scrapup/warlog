import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { ALLOWED_KEYWORDS, MAX_SCHEMA_DEPTH, MAX_SCHEMA_NODES, assertMatchesSchema, assertRestrictedSchema, schemaViolations } from '../../../../src/domain/var/restricted-schema-validator.ts';
import { assertType, describeType, inferType, isVarType, matchesType } from '../../../../src/domain/var/var-type-validator.ts';
import { valueAtPath } from '../../../../src/domain/var/var-path.ts';

/**
 * Captures the error of a synchronous call.
 * @param fn - Call expected to throw.
 * @returns The error.
 */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('variable types', () => {
  it('[WL-26] matches exactly the declared type, never coercing (WL-28)', () => {
    expect(matchesType('string', 'no')).toBe(true);
    expect(matchesType('string', 12)).toBe(false);
    expect(matchesType('boolean', 'false')).toBe(false);
    expect(matchesType('boolean', false)).toBe(true);
    expect(matchesType('integer', 12)).toBe(true);
    expect(matchesType('integer', 1.5)).toBe(false);
    expect(matchesType('integer', '12')).toBe(false);
    expect(matchesType('number', 1.5)).toBe(true);
    expect(matchesType('number', Number.NaN)).toBe(false);
    expect(matchesType('array', [])).toBe(true);
    expect(matchesType('array', {})).toBe(false);
    expect(matchesType('object', { a: 1 })).toBe(true);
    expect(matchesType('object', [])).toBe(false);
    expect(matchesType('object', null)).toBe(false);
    expect(isVarType('integer')).toBe(true);
    expect(isVarType('date')).toBe(false);
    expect(isVarType(3)).toBe(false);
  });

  it('[WL-26] infers the narrowest type and rejects unsupported values', () => {
    expect([inferType('x'), inferType(true), inferType(3), inferType(3.5), inferType([1]), inferType({ a: 1 })]).toEqual(['string', 'boolean', 'integer', 'number', 'array', 'object']);
    expect(isWarlogError(thrown(() => inferType(null)), 'VALIDATION')).toBe(true);
    expect(describeType(null)).toBe('null');
    expect(describeType(undefined)).toBe('unsupported');
    expect(describeType(2)).toBe('integer');
    const error = thrown(() => assertType('boolean', 'no'));
    expect(isWarlogError(error, 'VALIDATION') ? error.details : undefined).toMatchObject({ type: 'boolean', found: 'string' });
  });

  it('[WL-27] reads fields inside values by a dotted path, own properties and array indexes only', () => {
    const value = { limits: { max: 5, list: ['a', { deep: true }] }, 'a.b': 1 };
    expect(valueAtPath(value, 'limits.max')).toBe(5);
    expect(valueAtPath(value, 'limits.list.1.deep')).toBe(true);
    expect(valueAtPath(value, 'limits.list.0')).toBe('a');
    for (const path of ['limits.nope', 'limits.list.9', 'limits.list.x', 'toString', '__proto__', 'limits.max.deeper', 'a.b']) {
      expect(isWarlogError(thrown(() => valueAtPath(value, path)), 'NOT_FOUND')).toBe(true);
    }
    expect(isWarlogError(thrown(() => valueAtPath(value, 'limits..max')), 'VALIDATION')).toBe(true);
    expect(isWarlogError(thrown(() => valueAtPath(value, 'x'.repeat(300))), 'VALIDATION')).toBe(true);
  });
});

describe('restricted schema', () => {
  const schema = { type: 'object', properties: { retries: { type: 'integer', minimum: 0, maximum: 5 }, mode: { enum: ['a', 'b'] }, tags: { type: 'array', items: { type: 'string', maxLength: 3 }, maxItems: 2 } }, required: ['retries'], additionalProperties: false };

  it('[WL-26] validates objects and arrays structurally and reports paths without values', () => {
    expect(schemaViolations(schema, { retries: 2, mode: 'a', tags: ['ab'] })).toEqual([]);
    const issues = schemaViolations(schema, { retries: 9, mode: 'secret-looking', tags: ['abcd', 'x', 'y'], extra: 1 });
    expect(issues.map((i) => i.path).sort()).toEqual(['', '/mode', '/retries', '/tags', '/tags/0']);
    expect(JSON.stringify(issues)).not.toContain('secret-looking');
    const error = thrown(() => assertMatchesSchema(schema, { retries: 'x' }));
    expect(isWarlogError(error, 'VALIDATION') ? error.details?.['issues'] : undefined).toEqual([{ path: 'value.retries', message: 'must be integer' }]);
    expect(() => assertMatchesSchema(schema, { retries: 1 })).not.toThrow();
    expect(schemaViolations({ type: ['string', 'null'], const: 'x' }, null)).toEqual([expect.objectContaining({ message: 'must be equal to constant' })]);
  });

  it.each(['pattern', 'patternProperties', 'format', '$ref', 'oneOf', '$defs', 'if', 'dependencies'])('[WL-48] rejects the keyword %s (caller-supplied patterns break linear time)', (keyword) => {
    const error = thrown(() => assertRestrictedSchema({ type: 'object', properties: { a: { type: 'string', [keyword]: '^(a+)+$' } } }));
    expect(isWarlogError(error, 'VALIDATION')).toBe(true);
    expect(isWarlogError(error, 'VALIDATION') ? error.message : '').toContain(`.properties.a.${keyword}`);
    expect(ALLOWED_KEYWORDS).not.toContain(keyword);
  });

  it('[WL-26] checks the schema itself before use: shapes, types, size and depth', () => {
    const bad: unknown[] = [
      'string',
      { type: 'text' },
      { type: ['string', 3] },
      { minimum: 'x' },
      { maxItems: Number.POSITIVE_INFINITY },
      { required: 'a' },
      { required: [1] },
      { enum: 'a' },
      { properties: [] },
      { properties: { a: 1 } },
      { items: 'x' },
      { additionalProperties: 3 },
    ];
    for (const candidate of bad) {
      expect(isWarlogError(thrown(() => assertRestrictedSchema(candidate)), 'VALIDATION')).toBe(true);
    }
    expect(() => assertRestrictedSchema({ additionalProperties: { type: 'string' }, items: { type: 'integer' } })).not.toThrow();
    let deep: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i <= MAX_SCHEMA_DEPTH; i += 1) {
      deep = { items: deep };
    }
    expect(isWarlogError(thrown(() => assertRestrictedSchema(deep)), 'VALIDATION')).toBe(true);
    const wide = { properties: Object.fromEntries(Array.from({ length: MAX_SCHEMA_NODES }, (_, i) => [`p${i}`, { type: 'string' }])) };
    expect(isWarlogError(thrown(() => assertRestrictedSchema(wide)), 'VALIDATION')).toBe(true);
  });
});
