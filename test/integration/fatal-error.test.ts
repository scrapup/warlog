import { afterAll, describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isolatedEnv } from '../support/isolated-env.ts';
import { runNode } from '../support/run-node.ts';

const BIN = join(process.cwd(), 'test', 'support', 'invalid-registry-bin.ts');
const iso = isolatedEnv();

afterAll(() => {
  iso.dispose();
});

describe('failure while wiring the command line', () => {
  it('[WL-39] [WL-40] exits 1 with a stable error, a codes-only log line and no local paths', () => {
    const result = runNode([BIN, '--version'], { cwd: iso.cwd, env: iso.env, timeoutMs: 10_000 });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    const home = iso.env['HOME'];
    expect(home).toBeDefined();
    const [log, ...rest] = result.stderr.trimEnd().split('\n');
    const entry: Record<string, unknown> = JSON.parse(log ?? '');
    expect(entry).toMatchObject({ level: 'error', event: 'cli.failed', error_code: 'INTERNAL', error_name: 'WarlogError' });
    expect(Object.keys(entry).sort()).toEqual(['error_code', 'error_name', 'event', 'level', 'ts']);
    expect(rest.join('\n')).toBe('INTERNAL: cannot load operations from ~/plugins');
    expect(result.stderr).not.toContain(String(home));
  }, 30_000);
});
