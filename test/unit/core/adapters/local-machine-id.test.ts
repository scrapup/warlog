import { describe, expect, it } from '@jest/globals';
import { LocalMachineId, sanitizeHostName } from '../../../../src/core/adapters/local-machine-id.ts';
import { MemoryFileSystem } from '../../../support/fakes/memory-file-system.ts';
import { MemoryEnv } from '../../../support/fakes/simple-fakes.ts';

/** Deterministic random bytes. */
const RANDOM = (count: number): Uint8Array => Uint8Array.from({ length: count }, (_, i) => i * 7);

describe('LocalMachineId', () => {
  it('creates <host>-<6 base32> under ~/.config/warlog and caches it', async () => {
    const fs = new MemoryFileSystem();
    const provider = new LocalMachineId(fs, new MemoryEnv(), RANDOM);
    const id = await provider.get();
    expect(id).toBe('test-host-07enw3');
    expect(fs.files.get('/home/u/.config/warlog/machine-id')).toBe(`${id}\n`);
    fs.files.clear();
    expect(await provider.get()).toBe(id);
  });

  it('reads an existing id and honors XDG_CONFIG_HOME', async () => {
    const fs = new MemoryFileSystem({ '/cfg/warlog/machine-id': 'laptop-zzzzzz\n' });
    expect(await new LocalMachineId(fs, new MemoryEnv({ XDG_CONFIG_HOME: '/cfg' }), RANDOM).get()).toBe('laptop-zzzzzz');
  });

  it('recreates an empty id file', async () => {
    const fs = new MemoryFileSystem({ '/home/u/.config/warlog/machine-id': '  \n' });
    expect(await new LocalMachineId(fs, new MemoryEnv(), RANDOM).get()).toBe('test-host-07enw3');
  });

  it('fails fast with the path when the id cannot be read or written', async () => {
    const unreadable = new MemoryFileSystem();
    unreadable.readFile = async () => Promise.reject(new Error('EACCES'));
    await expect(new LocalMachineId(unreadable, new MemoryEnv(), RANDOM).get()).rejects.toMatchObject({
      code: 'INTERNAL',
      details: { path: '/home/u/.config/warlog/machine-id' },
    });
    const unwritable = new MemoryFileSystem();
    unwritable.failWrites.add('/home/u/.config/warlog/machine-id');
    await expect(new LocalMachineId(unwritable, new MemoryEnv(), RANDOM).get()).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it.each([
    ['My.Laptop_01', 'my-laptop-01'],
    ['', 'host'],
    ['a'.repeat(50), 'a'.repeat(40)],
  ])('sanitizes host name %p', (raw, expected) => {
    expect(sanitizeHostName(raw)).toBe(expected);
  });
});
