import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Root of the domain sources. */
const DOMAIN = join(process.cwd(), 'src', 'domain');

/**
 * Handler files of the domain.
 * @returns Absolute paths.
 */
function handlerFiles(): string[] {
  return readdirSync(DOMAIN, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.handler.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe('operation and handler modules', () => {
  it('[WL-02] no handler imports a value from its operation file (the operation imports the handler)', () => {
    const offenders = handlerFiles().filter((file) => /^import \{[^}]*\} from '\.\/[a-z-]+\.operation\.ts';$/mu.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.slice(DOMAIN.length))).toEqual([]);
  });
});
