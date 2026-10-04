import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import type { EntityRef } from '../../../../src/core/storage/entity-ref.ts';
import { GLOBAL_ROOT, REPO_ROOT, memoryStore } from '../../../support/store-fixture.ts';

const P = '01J00000000000000000000001';
const T = '01J00000000000000000000002';
const X = '01J00000000000000000000003';

describe('EntityPaths', () => {
  it.each<[EntityRef, string]>([
    [{ type: 'project', id: P, scope: 'repo', projectId: P }, join(REPO_ROOT, 'projects', P, 'project.md')],
    [{ type: 'epic', id: X, scope: 'repo', projectId: P }, join(REPO_ROOT, 'projects', P, 'epics', `${X}.md`)],
    [{ type: 'story', id: X, scope: 'repo', projectId: P }, join(REPO_ROOT, 'projects', P, 'stories', `${X}.md`)],
    [{ type: 'task', id: X, scope: 'repo', projectId: P }, join(REPO_ROOT, 'projects', P, 'tasks', `${X}.md`)],
    [{ type: 'note', id: X, scope: 'repo', projectId: P }, join(REPO_ROOT, 'projects', P, 'notes', `${X}.md`)],
    [{ type: 'note', id: X, scope: 'repo' }, join(REPO_ROOT, 'notes', `${X}.md`)],
    [{ type: 'response', id: X, scope: 'repo', projectId: P }, join(REPO_ROOT, 'projects', P, 'responses', `${X}.md`)],
    [{ type: 'comment', id: X, scope: 'repo', projectId: P, taskId: T }, join(REPO_ROOT, 'projects', P, 'comments', T, `${X}.md`)],
    [{ type: 'memory', id: X, scope: 'repo' }, join(REPO_ROOT, 'memories', `${X}.md`)],
    [{ type: 'memory', id: X, scope: 'global' }, join(GLOBAL_ROOT, 'global', 'memories', `${X}.md`)],
    [{ type: 'questionnaire', id: 'aar', scope: 'global' }, join(GLOBAL_ROOT, 'global', 'questionnaires', 'aar.md')],
    [{ type: 'questionnaire', id: 'aar', scope: 'repo' }, join(REPO_ROOT, 'questionnaires', 'aar.md')],
    [{ type: 'template', id: X, scope: 'global' }, join(GLOBAL_ROOT, 'templates', `${X}.md`)],
  ])('[WL-04] one file per entity: %o', async (ref, expected) => {
    expect(await memoryStore().paths.pathFor(ref)).toBe(expected);
  });

  it.each<EntityRef>([
    { type: 'task', id: '../../x', scope: 'repo', projectId: P },
    { type: 'task', id: X, scope: 'repo', projectId: '..' },
    { type: 'task', id: X, scope: 'repo' },
    { type: 'comment', id: X, scope: 'repo', projectId: P },
    { type: 'questionnaire', id: '../aar', scope: 'global' },
    { type: 'task', id: X, scope: 'global', projectId: P },
    { type: 'template', id: X, scope: 'repo' },
    { type: 'project', id: P, scope: 'repo', projectId: X },
  ])('[WL-49] rejects %o', async (ref) => {
    await expect(memoryStore().paths.pathFor(ref)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('[WL-03] raises NO_REPO_CONTEXT for repository scope outside a repository', async () => {
    const store = memoryStore({ withRepository: false });
    await expect(store.paths.pathFor({ type: 'memory', id: X, scope: 'repo' })).rejects.toMatchObject({ code: 'NO_REPO_CONTEXT' });
    expect(store.paths.rootOf('global')).toBe(GLOBAL_ROOT);
  });
});
