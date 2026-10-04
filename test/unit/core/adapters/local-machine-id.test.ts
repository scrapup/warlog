import { describe, expect, it } from '@jest/globals';
import { LocalMachineId, isMachineId, sanitizeHostName } from '../../../../src/core/adapters/local-machine-id.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { MemoryEnv } from '../../../support/fakes/simple-fakes.ts';

/** Deterministic random bytes. */
const RANDOM = (count: number): Uint8Array => Uint8Array.from({ length: count }, (_, i) => i * 7);
const ID_PATH = '/home/u/.config/warlog/machine-id';

/**
 * Builds a provider.
 * @param fs - File system.
 * @param vars - Environment variables.
 * @returns The provider.
 */
function provider(fs: MemoryFileSystem, vars: Record<string, string> = {}): LocalMachineId {
  return new LocalMachineId({ fs, env: new MemoryEnv(vars), random: RANDOM });
}

describe('LocalMachineId', () => {
  it('creates <host>-<6 base32> under ~/.config/warlog and caches it', async () => {
    const fs = new MemoryFileSystem();
    const machine = provider(fs);
    const id = await machine.get();
    expect(id).toBe('test-host-07enw3');
    expect(fs.files.get(ID_PATH)).toBe(`${id}\n`);
    fs.files.clear();
    expect(await machine.get()).toBe(id);
  });

  it('reads an existing id and honors an absolute XDG_CONFIG_HOME', async () => {
    const fs = new MemoryFileSystem({ '/cfg/warlog/machine-id': 'laptop-zzzzzz\n' });
    expect(await provider(fs, { XDG_CONFIG_HOME: '/cfg' }).get()).toBe('laptop-zzzzzz');
  });

  it('ignores a relative XDG_CONFIG_HOME', async () => {
    const fs = new MemoryFileSystem();
    await provider(fs, { XDG_CONFIG_HOME: 'relative/cfg' }).get();
    expect([...fs.files.keys()]).toEqual([ID_PATH]);
  });

  it('recreates an empty id file', async () => {
    expect(await provider(new MemoryFileSystem({ [ID_PATH]: '  \n' })).get()).toBe('test-host-07enw3');
  });

  it('[WL-49] rejects a malformed stored id', async () => {
    await expect(provider(new MemoryFileSystem({ [ID_PATH]: '../escape\n' })).get()).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('fails fast with the path when the id cannot be read', async () => {
    const fs = new MemoryFileSystem();
    fs.readFile = async () => Promise.reject(new Error('EACCES'));
    await expect(provider(fs).get()).rejects.toMatchObject({ code: 'INTERNAL', details: { path: ID_PATH } });
  });

  it('fails fast when the id cannot be written', async () => {
    const fs = new MemoryFileSystem();
    fs.failWrites.add(ID_PATH);
    await expect(provider(fs).get()).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it.each([
    ['My.Laptop_01', 'my-laptop-01'],
    ['', 'host'],
    ['a'.repeat(50), 'a'.repeat(40)],
  ])('sanitizes host name %p', (raw, expected) => {
    expect(sanitizeHostName(raw)).toBe(expected);
  });

  it.each([
    ['test-host-07enw3', true],
    ['', false],
    ['UPPER', false],
    ['a/b', false],
    ['a'.repeat(65), false],
  ])('validates machine id %p → %p', (id, ok) => {
    expect(isMachineId(id)).toBe(ok);
  });
});
