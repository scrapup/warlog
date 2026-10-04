import { describe, expect, it } from '@jest/globals';
import { parseYaml, stringifyYaml } from '../../../../src/core/storage/yaml-codec.ts';

describe('YAML codec', () => {
  it('[WL-28] reads YAML 1.1 booleans and octal-looking scalars without coercion', () => {
    expect(parseYaml('a: no\nb: off\nc: yes\nd: on\ne: 1.10\nf: 012\ng: 0o12\nh: ~\n', 'v.yaml')).toEqual({
      a: 'no',
      b: 'off',
      c: 'yes',
      d: 'on',
      e: 1.1,
      f: 12,
      g: 10,
      h: null,
    });
  });

  it('[WL-28] keeps written strings as strings through a round trip', () => {
    const value = { a: '012', b: 'no', c: '1.10', d: '~', e: 'off', f: 'true', g: 'null', h: '1e3', i: '' };
    expect(parseYaml(stringifyYaml(value), 'v.yaml')).toEqual(value);
  });

  it('[WL-28] keeps numbers, booleans, null, arrays and nested objects', () => {
    const value = { n: 1.5, i: 12, t: true, f: false, z: null, list: [1, 'two', { three: 3 }], obj: { deep: { deeper: [] } } };
    expect(parseYaml(stringifyYaml(value), 'v.yaml')).toEqual(value);
  });

  it('[SEC-23] rejects duplicate keys with file, line and column', () => {
    expect(() => parseYaml('a: 1\na: 2\n', 'vars/x.yaml')).toThrow(
      expect.objectContaining({ code: 'INVALID_FILE', details: { reason: 'yaml', file: 'vars/x.yaml', line: 2, col: 1 } }),
    );
  });

  it('[SEC-23] rejects malformed YAML', () => {
    expect(() => parseYaml('a: [1, 2\n', 'x.yaml')).toThrow(expect.objectContaining({ code: 'INVALID_FILE' }));
  });

  it('[SEC-23][WL-48] rejects a billion-laughs alias bomb', () => {
    const bomb = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
    for (let i = 0; i < 8; i += 1) {
      const prev = String.fromCharCode(97 + i);
      const next = String.fromCharCode(98 + i);
      bomb.push(`${next}: &${next} [*${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}]`);
    }
    expect(() => parseYaml(`${bomb.join('\n')}\n`, 'bomb.yaml')).toThrow(
      expect.objectContaining({ code: 'INVALID_FILE', message: 'bomb.yaml: excessive alias expansion' }),
    );
  });

  it('[SEC-23] fails closed on unknown tags instead of passing them through', () => {
    expect(() => parseYaml('a: !custom x\n', 'x.yaml')).toThrow(expect.objectContaining({ code: 'INVALID_FILE' }));
  });

  it('returns null for an empty document', () => {
    expect(parseYaml('', 'empty.yaml')).toBeNull();
  });
});
