import { describe, expect, it } from '@jest/globals';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { MAX_TRACE_NODES } from '../../../../src/domain/link/trace-walker.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

const MISSING = '01J00000000000000000000099';

/**
 * Builds spec ↔ story ↔ task ↔ test ↔ commit ↔ external key around one story.
 * @param h - Harness.
 * @returns Ids.
 */
async function matrix(h: TrackerHarness): Promise<{ projectId: string; epicId: string; story: string; t1: string; t2: string }> {
  const { projectId, epicId } = await container(h);
  const story = String((await h.obj('story_create', { project_id: projectId, epic_id: epicId, title: 'Pay with a saved card', code: 'US-12' }))['id']);
  const t1 = String((await h.obj('task_create', { story_id: story, title: 'Tokenize' }))['id']);
  const t2 = String((await h.obj('task_create', { story_id: story, title: 'Charge' }))['id']);
  await h.call('link_add', { id: story, rel: 'implements', target: 'spec:docs/specs/pay/spec.md#us-12' });
  await h.call('link_add', { id: t1, rel: 'tests', target: 'test:test/unit/tokenize.test.ts::tokenizes' });
  await h.call('link_add', { id: t1, rel: 'commit', target: 'git:abc1234' });
  await h.call('link_add', { id: t2, rel: 'commit', target: 'git:abc1234' });
  await h.call('external_link', { id: story, system: 'jira', key: 'SQ-12' });
  await h.call('external_link', { id: t1, system: 'clickup', key: 'CU-77', url: 'https://app.clickup.com/t/CU-77' });
  return { projectId, epicId, story, t1, t2 };
}

describe.each(['lazy', 'live'] as const)('trace (%s index)', (mode) => {
  it('[WL-22] builds the matrix use case ↔ story ↔ task ↔ test ↔ commit ↔ external key from any node', async () => {
    const h = trackerHarness({ mode });
    const { story, t1, t2, projectId } = await matrix(h);
    const fromStory = await h.obj('trace', { id: story });
    expect(fromStory).toMatchObject({ depth: 3, truncated: false, root: { id: story, type: 'story', label: 'Pay with a saved card' } });
    const columns = fromStory['matrix'] as Record<string, string[]>;
    expect(Object.keys(columns)).toEqual(['use_case', 'story', 'task', 'test', 'commit', 'external', 'other']);
    expect(columns['use_case']).toEqual(['spec:docs/specs/pay/spec.md#us-12']);
    expect(columns['story']).toEqual([`${story} Pay with a saved card`]);
    expect(columns['task']).toEqual([`${t1} Tokenize`, `${t2} Charge`]);
    expect(columns['test']).toEqual(['test:test/unit/tokenize.test.ts::tokenizes']);
    expect(columns['commit']).toEqual(['git:abc1234']);
    expect(columns['external']?.sort()).toEqual(['clickup:CU-77 clickup CU-77', 'jira:SQ-12 jira SQ-12']);
    const fromTask = await h.obj('trace', { id: t2, depth: 3 });
    expect((fromTask['matrix'] as Record<string, string[]>)['test']).toEqual(['test:test/unit/tokenize.test.ts::tokenizes']);
    expect((fromTask['matrix'] as Record<string, string[]>)['use_case']).toEqual(['spec:docs/specs/pay/spec.md#us-12']);
    const fromCommit = await h.obj('trace', { id: 'git:abc1234', depth: 2 });
    expect(fromCommit).toMatchObject({ root: { id: 'git:abc1234', type: 'git' } });
    expect(((fromCommit['matrix'] as Record<string, string[]>)['task'] ?? []).length).toBe(2);
    const rows = fromStory['rows'] as Record<string, unknown>[];
    expect(rows.find((r) => r['id'] === t1)).toMatchObject({ depth: 1, rel: 'child', direction: 'hierarchy', from: story });
    expect(rows.find((r) => r['id'] === 'git:abc1234')).toMatchObject({ depth: 2, rel: 'commit', direction: 'out', from: t1 });
    expect(rows.find((r) => r['type'] === 'project')?.['id']).toBe(projectId);
  });

  it('[WL-22] depth limits the walk', async () => {
    const h = trackerHarness({ mode });
    const { story } = await matrix(h);
    const one = await h.obj('trace', { id: story, depth: 1 });
    expect((one['rows'] as { depth: number }[]).every((r) => r.depth === 1)).toBe(true);
    expect(Object.keys(one['matrix'] as object)).not.toContain('commit');
    expect(isWarlogError(await failure(h.call('trace', { id: story, depth: 7 })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('trace', { id: story, depth: 0 })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('trace', { id: MISSING })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-22] [WL-44] cycles are followed once and pending edges appear as pending nodes', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const a = String((await task(h, epicId, 'A'))['id']);
    const b = String((await task(h, epicId, 'B'))['id']);
    await h.call('link_add', { id: a, rel: 'relates', target: b });
    await h.call('link_add', { id: b, rel: 'relates', target: a });
    await h.call('link_add', { id: a, rel: 'derived_from', target: MISSING });
    const traced = await h.obj('trace', { id: a, depth: 6 });
    const rows = traced['rows'] as Record<string, unknown>[];
    expect(rows.filter((r) => r['id'] === b)).toHaveLength(1);
    expect(rows.filter((r) => r['id'] === a)).toHaveLength(0);
    expect(rows.find((r) => r['id'] === MISSING)).toMatchObject({ type: 'pending', pending: true, rel: 'derived_from' });
    expect((traced['matrix'] as Record<string, string[]>)['pending']).toEqual([MISSING]);
    const fromPending = await h.obj('trace', { id: MISSING });
    expect(fromPending).toMatchObject({ root: { type: 'pending' } });
    expect((fromPending['rows'] as Record<string, unknown>[]).some((r) => r['id'] === a)).toBe(true);
  });

  it('[WL-22] a graph under the node limit is not truncated and raises no warning', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const hub = String((await task(h, epicId, 'hub'))['id']);
    expect(MAX_TRACE_NODES).toBe(2_000);
    for (let i = 0; i < 12; i += 1) {
      await h.call('link_add', { id: hub, rel: 'relates', target: `git:${String(i).padStart(7, 'a')}` });
    }
    const traced = await h.obj('trace', { id: hub });
    expect(traced['truncated']).toBe(false);
    expect(h.warnings).not.toContain('trace.truncated');
  });
});
