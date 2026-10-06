import { describe, expect, it } from '@jest/globals';
import { sha256Hex } from '../../../../src/core/security/sha256.ts';

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ])('[WL-68] fingerprints %p as 64 lower-case hex digits', (text, digest) => {
    expect(sha256Hex(text)).toBe(digest);
    expect(sha256Hex(new TextEncoder().encode(text))).toBe(digest);
  });

  it('[WL-68] hashes bytes that are not valid UTF-8 as they are', () => {
    expect(sha256Hex(Uint8Array.from([0, 255, 128]))).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(Uint8Array.from([0, 255, 128]))).not.toBe(sha256Hex(Uint8Array.from([0, 255, 129])));
  });
});
