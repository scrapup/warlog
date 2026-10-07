/**
 * Input read by the command line (`--file`, standard input): bounded in size, and a file must be a
 * regular file. A path may name a device or a pipe (`/dev/zero`, a FIFO) and a file may be huge;
 * neither may hang or exhaust the process before the input is even parsed.
 */
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { WarlogError } from '../core/errors/warlog-error.ts';

/** Largest input accepted (the size the store itself accepts for a file). */
export const MAX_INPUT_BYTES = 2 * 1024 * 1024;

/**
 * The error of an input that is too large.
 * @returns The error.
 */
function tooLarge(): WarlogError {
  return new WarlogError('INVALID_FILE', 'input is larger than 2 MiB', { reason: 'too_large' });
}

/**
 * Reads an input file.
 * @param path - File path.
 * @returns Its text.
 * @throws {WarlogError} `INVALID_FILE` when it is not a regular file or is larger than {@link MAX_INPUT_BYTES}.
 */
export async function readInputFile(path: string): Promise<string> {
  // Without O_NONBLOCK, opening a pipe waits until something writes to it.
  const handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new WarlogError('INVALID_FILE', 'input is not a regular file', { reason: 'not_regular' });
    }
    if (stat.size > MAX_INPUT_BYTES) {
      throw tooLarge();
    }
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_INPUT_BYTES) {
      throw tooLarge();
    }
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * Reads a stream (standard input) up to {@link MAX_INPUT_BYTES}.
 * @param stream - Chunks of text or bytes.
 * @returns Its text.
 * @throws {WarlogError} `INVALID_FILE` when more than {@link MAX_INPUT_BYTES} arrive.
 */
export async function readInputStream(stream: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += bytes.length;
    if (total > MAX_INPUT_BYTES) {
      throw tooLarge();
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total).toString('utf8');
}
