import { describe, expect, it } from '@jest/globals';
import { LocalMachineId } from '../../../../src/core/adapters/local-machine-id.ts';
import { isMachineId } from '../../../../src/core/security/identifiers.ts';
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
  it('creates a random m-<8 base32> id without the host name under ~/.config/warlog and caches it', async () => {
    const fs = new MemoryFileSystem();
    const machine = provider(fs);
    const id = await machine.get();
    expect(id).toBe('m-07enw3ah');
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
    expect(await provider(new MemoryFileSystem({ [ID_PATH]: '  \n' })).get()).toBe('m-07enw3ah');
  });

  it('[WL-49] rejects a malformed stored id', async () => {
    await expect(provider(new MemoryFileSystem({ [ID_PATH]: '../escape\n' })).get()).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('fails fast with the path when the id cannot be read', async () => {
    const fs = new MemoryFileSystem();
    fs.readFile = async () => Promise.reject(new Error('EACCES'));
    await expect(provider(fs).get()).rejects.toMatchObject({ code: 'INTERNAL', details: { file: 'machine-id' } });
  });

  it('fails fast when the id cannot be written', async () => {
    const fs = new MemoryFileSystem();
    fs.failWrites.add(ID_PATH);
    await expect(provider(fs).get()).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('shares one resolution between concurrent first calls', async () => {
    const fs = new MemoryFileSystem();
    const machine = provider(fs);
    const ids = await Promise.all([machine.get(), machine.get(), machine.get()]);
    expect(new Set(ids).size).toBe(1);
  });

  it('retries after a failed first resolution', async () => {
    const fs = new MemoryFileSystem();
    fs.failWrites.add(ID_PATH);
    const machine = provider(fs);
    await expect(machine.get()).rejects.toMatchObject({ code: 'INTERNAL' });
    fs.failWrites.clear();
    expect(await machine.get()).toBe('m-07enw3ah');
  });

  it('uses a valid WARLOG_MACHINE_ID override without touching the file', async () => {
    const fs = new MemoryFileSystem();
    expect(await provider(fs, { WARLOG_MACHINE_ID: 'ci-runner-1' }).get()).toBe('ci-runner-1');
    expect(fs.files.size).toBe(0);
  });

  it('prefers a valid WARLOG_MACHINE_ID over a stored id, leaving the file untouched', async () => {
    const fs = new MemoryFileSystem({ [ID_PATH]: 'm-zzzzzzzz\n' });
    expect(await provider(fs, { WARLOG_MACHINE_ID: 'ci-runner-1' }).get()).toBe('ci-runner-1');
    expect(fs.files.get(ID_PATH)).toBe('m-zzzzzzzz\n');
  });

  it('rejects a malformed WARLOG_MACHINE_ID', async () => {
    await expect(provider(new MemoryFileSystem(), { WARLOG_MACHINE_ID: 'Bad/Id' }).get()).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it.each([
    ['m-07enw3ah', true],
    ['', false],
    ['UPPER', false],
    ['a/b', false],
    ['a'.repeat(64), true],
    ['a'.repeat(65), false],
    ['-leading', false],
    ['con', false],
    ['nul', false],
  ])('[WL-49] validates machine id %p → %p', (id, ok) => {
    expect(isMachineId(id)).toBe(ok);
  });
});
