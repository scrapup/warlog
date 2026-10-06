import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { MAX_INPUT_BYTES, readInputFile, readInputStream } from '../../../src/compose/bounded-input.ts';

let dir = '';

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A fresh folder.
 * @returns Its path.
 */
function folder(): string {
  dir = mkdtempSync(join(tmpdir(), 'warlog-input-'));
  return dir;
}

describe('input read by the command line', () => {
  it('[WL-36] reads a regular file of up to 2 MiB, and no more', async () => {
    const d = folder();
    writeFileSync(join(d, 'ok.yaml'), 'é'.repeat(10));
    expect(await readInputFile(join(d, 'ok.yaml'))).toBe('é'.repeat(10));
    writeFileSync(join(d, 'edge.txt'), 'a'.repeat(MAX_INPUT_BYTES));
    expect((await readInputFile(join(d, 'edge.txt'))).length).toBe(MAX_INPUT_BYTES);
    writeFileSync(join(d, 'big.txt'), 'a'.repeat(MAX_INPUT_BYTES + 1));
    await expect(readInputFile(join(d, 'big.txt'))).rejects.toMatchObject({ code: 'INVALID_FILE', details: { reason: 'too_large' } });
  });

  it('[WL-36] refuses a directory and a missing file', async () => {
    const d = folder();
    mkdirSync(join(d, 'sub'));
    await expect(readInputFile(join(d, 'sub'))).rejects.toThrow();
    await expect(readInputFile(join(d, 'missing.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  (process.platform === 'win32' ? it.skip : it)('[WL-36] refuses a pipe instead of waiting for it, and an endless device instead of filling memory', async () => {
    const d = folder();
    execFileSync('mkfifo', [join(d, 'pipe')]);
    await expect(Promise.race([readInputFile(join(d, 'pipe')), new Promise((_, reject) => setTimeout(() => reject(new Error('blocked')), 2_000))])).rejects.toMatchObject({ details: { reason: 'not_regular' } });
    await expect(readInputFile('/dev/zero')).rejects.toMatchObject({ details: { reason: 'not_regular' } });
  });

  it('[WL-36] reads standard input up to 2 MiB and stops reading beyond it', async () => {
    expect(await readInputStream(Readable.from([Buffer.from('ab'), 'cd']))).toBe('abcd');
    let produced = 0;
    async function* endless(): AsyncGenerator<Buffer> {
      for (;;) {
        produced += 1;
        yield Buffer.alloc(64 * 1024);
      }
    }
    await expect(readInputStream(endless())).rejects.toMatchObject({ code: 'INVALID_FILE', details: { reason: 'too_large' } });
    expect(produced).toBeLessThanOrEqual(MAX_INPUT_BYTES / (64 * 1024) + 2);
  });
});
