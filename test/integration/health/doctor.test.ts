import { afterAll, describe, expect, it } from '@jest/globals';
import { mkdirSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringifyFrontMatter } from '../../../src/core/storage/front-matter-codec.ts';
import { isolatedEnv } from '../../support/isolated-env.ts';
import { runNode } from '../../support/run-node.ts';

const BIN = join(process.cwd(), 'src', 'bin', 'warlog.ts');
const M1 = '01J00000000000000000000M01';
const iso = isolatedEnv();

afterAll(() => {
  iso.dispose();
});

/**
 * Content and modification time of every file under a directory.
 * @param dir - Directory.
 * @returns Snapshot by relative path.
 */
function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const path = join(e.parentPath, e.name);
        return [path.slice(dir.length), `${statSync(path).mtimeMs}:${readFileSync(path, 'utf8')}`];
      }),
  );
}

describe('warlog doctor on a real store', () => {
  it('[WL-45] lists the problems of the store and writes nothing', () => {
    const memories = join(iso.store, 'global', 'memories');
    mkdirSync(memories, { recursive: true });
    writeFileSync(join(memories, `${M1}.md`), stringifyFrontMatter({ data: { id: M1, type: 'memory', rev: 1, created_at: 'x', updated_at: 'x', machine: 'm', links: [{ rel: 'relates', target: '01J00000000000000000000X99' }] }, body: '' }));
    writeFileSync(join(memories, `${M1}.sync-conflict-20261001-ABC.md`), 'copy');
    writeFileSync(join(memories, '01J00000000000000000000M02.md'), '---\n<<<<<<< a\n=======\n>>>>>>> b\n---\n');
    writeFileSync(join(memories, `.${M1}.md.tmp-1-x`), 'partial');
    const old = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(join(memories, `.${M1}.md.tmp-1-x`), old, old);
    const before = snapshot(iso.store);
    const result = runNode([BIN, 'doctor', '--format', 'json'], { cwd: iso.cwd, env: iso.env, timeoutMs: 20_000 });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      healthy: false,
      conflict_copies: [{ root: 'global', path: `global/memories/${M1}.sync-conflict-20261001-ABC.md` }],
      merge_conflicts: [{ root: 'global', path: 'global/memories/01J00000000000000000000M02.md' }],
      pending_links: [{ from: M1, rel: 'relates', target: '01J00000000000000000000X99' }],
      invalid_files: [],
      document_references: [],
      memories_due_for_review: [],
      stale_temp_files: [{ root: 'global', path: `global/memories/.${M1}.md.tmp-1-x` }],
    });
    expect(result.stdout).not.toContain(iso.store);
    expect(snapshot(iso.store)).toEqual(before);
  }, 30_000);
});
