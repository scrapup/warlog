import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../src/core/adapters/node-file-system.ts';
import { PathGuard } from '../../../src/core/security/path-guard.ts';
import { EntityFileRepository } from '../../../src/core/storage/entity-file-repository.ts';
import { EntityPaths } from '../../../src/core/storage/entity-paths.ts';
import { FixedClock, FixedMachineId } from '../../support/fakes/simple-fakes.ts';

let root = '';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'warlog-conc-'));
  const fs = new NodeFileSystem();
  const paths = new EntityPaths({ global: root, repository: { root, key: 'k', mode: 'in-repo', mainWorktree: root }, warnings: [] }, new PathGuard(fs));
  const repo = new EntityFileRepository({ fs, paths, clock: new FixedClock(), machine: new FixedMachineId() });
  await repo.create({ type: 'task', id: '01J00000000000000000000002', scope: 'repo', projectId: '01J00000000000000000000001' }, { title: 'start' });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Starts a child process updating the task.
 * @param value - New title.
 * @returns The child's output.
 */
function update(value: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['test/support/concurrent-update.ts', root, value], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', () => resolve(out));
  });
}

describe('two processes updating the same entity', () => {
  it('[WL-42][WL-41] exactly one succeeds and the other gets CONFLICT; no partial file remains', async () => {
    const results = await Promise.all([update('first'), update('second')]);
    expect([...results].sort()).toEqual(['CONFLICT:stale_rev', 'ok']);
    const dir = join(root, 'projects', '01J00000000000000000000001', 'tasks');
    expect(readdirSync(dir)).toEqual(['01J00000000000000000000002.md']);
    expect(readdirSync(root, { recursive: true }).some((f) => String(f).includes('.tmp-') || String(f).endsWith('.lock'))).toBe(false);
    const winner = results[0] === 'ok' ? 'first' : 'second';
    expect(readFileSync(join(dir, '01J00000000000000000000002.md'), 'utf8')).toContain(`title: ${winner}`);
  }, 60_000);
});
