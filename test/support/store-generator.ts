/**
 * Test helper: writes a realistic store of N entity files on disk (benchmarks, plan §3.7).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringifyFrontMatter } from '../../src/core/storage/front-matter-codec.ts';

/** Crockford base32 digits. */
const DIGITS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A deterministic ULID-shaped id.
 * @param prefix - Two-letter prefix.
 * @param n - Sequence number.
 * @returns The id.
 */
export function fakeUlid(prefix: string, n: number): string {
  let rest = '';
  let value = n;
  for (let i = 0; i < 10; i += 1) {
    rest = (DIGITS[value % 32] ?? '0') + rest;
    value = Math.floor(value / 32);
  }
  return `01J${prefix}${'0'.repeat(26 - 3 - prefix.length - 10)}${rest}`;
}

/** Layout of a generated store. */
export interface GeneratedStore {
  /** Repository data root. */
  readonly repoRoot: string;
  /** Global root. */
  readonly globalRoot: string;
  /** Number of entity files written. */
  readonly files: number;
}

/**
 * Writes a store: 10 projects, tasks with descriptions and dependencies, notes and global memories.
 * @param base - Directory to write into.
 * @param total - Number of entity files.
 * @returns The layout.
 */
export function generateStore(base: string, total: number): GeneratedStore {
  const repoRoot = join(base, 'repo', '.warlog');
  const globalRoot = join(base, 'global');
  const projects = Array.from({ length: 10 }, (_, i) => fakeUlid('PR', i));
  const write = (path: string, data: Record<string, unknown>, body: string): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, stringifyFrontMatter({ data: { rev: 1, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', machine: 'm-aaaaaaaa', ...data }, body }));
  };
  projects.forEach((p) => write(join(repoRoot, 'projects', p, 'project.md'), { id: p, type: 'project', name: p, status: 'active' }, ''));
  for (let i = projects.length; i < total; i += 1) {
    const project = projects[i % projects.length] ?? '';
    if (i % 10 === 0) {
      const id = fakeUlid('ME', i);
      write(join(globalRoot, 'global', 'memories', `${id}.md`), { id, type: 'memory', scope: 'global', kind: 'fact', title: `Memory ${i}`, status: 'active', tags: ['bench'] }, `Fact number ${i}.\n`);
    } else {
      const id = fakeUlid('TA', i);
      const deps = i > 20 ? [fakeUlid('TA', i - 11)] : [];
      write(join(repoRoot, 'projects', project, 'tasks', `${id}.md`), { id, type: 'task', project_id: project, title: `Task ${i}`, status: 'todo', priority: 'medium', depends_on: deps, tags: ['bench', 'index'] }, `## Description\n\nTask ${i} body with some text.\n`);
    }
  }
  return { repoRoot, globalRoot, files: total };
}
