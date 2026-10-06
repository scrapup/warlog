import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { promotableText } from '../../../../src/domain/response/promotable-text.ts';
import { productOperations } from '../../../../src/domain/operations.ts';
import { norm } from '../../../support/fakes/path-map.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure, task } from '../../../support/tracker-setup.ts';

const AAR = { outcome: 'partial', trigger: 'US-97 merged', expected: 'one PR', happened: 'three stacked PRs', why_difference: 'reviews were stacked', sustain: ['small commits'], improve: ['smaller stories', 'merge earlier'] };

/**
 * Creates a task and an AAR response about it.
 * @param h - Harness.
 * @param answers - Answers.
 * @returns The task id and the response.
 */
async function respond(h: TrackerHarness, answers: Record<string, unknown> = AAR): Promise<{ taskId: string; response: Record<string, unknown> }> {
  const { epicId } = await container(h);
  const taskId = String((await task(h, epicId, 'Ship US-97'))['id']);
  return { taskId, response: await h.obj('response_create', { questionnaire: 'aar', subject_id: taskId, answers }) };
}

describe.each(['lazy', 'live'] as const)('responses (%s index)', (mode) => {
  it('[WL-31] a response stores the answers, a copy of the questions and a rendered body, linked to its subject', async () => {
    const h = trackerHarness({ mode });
    const { taskId, response } = await respond(h);
    expect(response).toMatchObject({ questionnaire: 'aar', questionnaire_version: 1, subject: { type: 'task', id: taskId }, answers: AAR, rev: 1 });
    expect((response['questions'] as unknown[]).length).toBe(7);
    expect(response['content']).toBe(
      [
        '## What was the outcome?\n\npartial',
        '## What triggered this review?\n\nUS-97 merged',
        '## What did we expect to happen?\n\none PR',
        '## What actually happened?\n\nthree stacked PRs',
        '## Why was there a difference?\n\nreviews were stacked',
        '## What should we sustain?\n\n- small commits',
        '## What should we improve?\n\n- smaller stories\n- merge earlier',
      ].join('\n\n'),
    );
    expect([...h.fs.files.keys()].some((p) => p.endsWith(norm(join('responses', `${String(response['id'])}.md`))))).toBe(true);
    expect(await h.obj('response_get', { id: response['id'] })).toMatchObject({ id: response['id'], answers: AAR });
    expect(h.activityRecords().filter((r) => r['entity_type'] === 'response')).toEqual([expect.objectContaining({ action: 'created', entity_id: response['id'] })]);
    expect(h.activityRecords().filter((r) => r['entity_type'] === 'questionnaire')).toEqual([expect.objectContaining({ entity_id: 'aar', action: 'created' })]);
  });

  it('[WL-33] the built-in aar is written as a global file the first time it is used', async () => {
    const h = trackerHarness({ mode });
    expect([...h.fs.files.keys()].some((p) => p.includes('questionnaires'))).toBe(false);
    await respond(h);
    expect([...h.fs.files.keys()].filter((p) => p.endsWith(norm(join('global', 'questionnaires', 'aar.md'))))).toHaveLength(1);
    expect(await h.obj('questionnaire_get', { slug: 'aar' })).toMatchObject({ version: 1 });
    expect(await h.obj('questionnaire_get', { slug: 'aar' })).not.toHaveProperty('builtin');
    const second = await h.obj('response_create', { questionnaire: 'aar', subject_id: (await h.rows('response_list'))[0]?.['subject_id'], answers: { ...AAR, outcome: 'success', why_difference: undefined } });
    expect(second).toMatchObject({ questionnaire_version: 1 });
    expect((await h.obj('questionnaire_get', { slug: 'aar' }))['version']).toBe(1);
  });

  it('[WL-31] the response keeps the questions it answered after the questionnaire changes', async () => {
    const h = trackerHarness({ mode });
    const { epicId, projectId } = await container(h);
    const story = String((await h.obj('story_create', { project_id: projectId, epic_id: epicId, title: 'S' }))['id']);
    await h.call('questionnaire_define', { slug: 'check', title: 'Check', questions: [{ id: 'ready', type: 'boolean', prompt: 'Ready?', required: true }] });
    const response = await h.obj('response_create', { questionnaire: 'check', subject_id: story, answers: { ready: true } });
    await h.call('questionnaire_define', { slug: 'check', title: 'Check', questions: [{ id: 'ready', type: 'text', prompt: 'Ready? (rewritten)', required: true }, { id: 'extra', type: 'text', prompt: 'Extra', required: true }] });
    const stored = await h.obj('response_get', { id: response['id'] });
    expect(stored).toMatchObject({ questionnaire_version: 1, questions: [{ id: 'ready', type: 'boolean', prompt: 'Ready?' }], answers: { ready: true } });
    expect(stored['content']).toBe('## Ready?\n\nYes');
    expect((await h.obj('response_create', { questionnaire: 'check', subject_id: story, answers: { ready: 'yes', extra: 'x' } }))['questionnaire_version']).toBe(2);
  });

  it('[WL-31] invalid responses are rejected with every invalid question listed, and nothing is written', async () => {
    const h = trackerHarness({ mode });
    const { epicId } = await container(h);
    const taskId = String((await task(h, epicId, 'T'))['id']);
    const before = new Map(h.fs.files);
    const error = await failure(h.call('response_create', { questionnaire: 'aar', subject_id: taskId, answers: { outcome: 'great', trigger: 5, happened: 'x'.repeat(20_001), improve: 'not a list', ghost: 1 } }));
    expect(isWarlogError(error, 'VALIDATION') ? error.details?.['issues'] : undefined).toEqual([
      { path: 'answers.outcome', message: 'must be one of success, partial, failure' },
      { path: 'answers.trigger', message: 'must be text' },
      { path: 'answers.expected', message: 'is required' },
      { path: 'answers.happened', message: 'must be at most 20000 characters' },
      { path: 'answers.why_difference', message: 'is required' },
      { path: 'answers.improve', message: 'must be a list of texts' },
      { path: 'answers.ghost', message: 'is not a question of this questionnaire' },
    ]);
    expect(new Map(h.fs.files)).toEqual(before);
    expect(isWarlogError(await failure(h.call('response_create', { questionnaire: 'aar', subject_id: taskId, answers: {} })), 'VALIDATION')).toBe(true);
  });

  it('[WL-31] the subject must exist and be a task, story, epic or project', async () => {
    const h = trackerHarness({ mode });
    const { projectId, epicId } = await container(h);
    expect(isWarlogError(await failure(h.call('response_create', { questionnaire: 'aar', subject_id: '01J00000000000000000000099', answers: AAR })), 'NOT_FOUND')).toBe(true);
    const note = String((await h.obj('note_save', { title: 'n', content: 'c' }))['id']);
    expect(isWarlogError(await failure(h.call('response_create', { questionnaire: 'aar', subject_id: note, answers: AAR })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('response_create', { questionnaire: 'nope', subject_id: epicId, answers: AAR })), 'NOT_FOUND')).toBe(true);
    expect((await h.obj('response_create', { questionnaire: 'aar', subject_id: projectId, answers: { ...AAR, outcome: 'success', why_difference: undefined } }))['subject']).toEqual({ type: 'project', id: projectId });
    expect((await h.obj('response_create', { questionnaire: 'aar', subject_id: epicId, answers: { ...AAR, outcome: 'success', why_difference: undefined } }))['subject']).toEqual({ type: 'epic', id: epicId });
  });

  it('[WL-31] response_list filters by subject, questionnaire and project, newest first', async () => {
    const h = trackerHarness({ mode });
    const { taskId, response } = await respond(h);
    const other = await container(h);
    h.clock.advance(1000);
    await h.call('questionnaire_define', { slug: 'check', title: 'C', questions: [{ id: 'ok', type: 'boolean', prompt: 'OK?' }] });
    const second = await h.obj('response_create', { questionnaire: 'check', subject_id: other.epicId, answers: { ok: true } });
    expect((await h.rows('response_list')).map((r) => r['id'])).toEqual([second['id'], response['id']]);
    expect((await h.rows('response_list', { questionnaire: 'aar' })).map((r) => r['id'])).toEqual([response['id']]);
    expect((await h.rows('response_list', { subject_id: other.epicId }))[0]).toMatchObject({ questionnaire: 'check', questionnaire_version: 1, subject_type: 'epic', answered: 1 });
    expect((await h.rows('response_list', { project_id: other.projectId })).map((r) => r['id'])).toEqual([second['id']]);
    expect((await h.rows('response_list', { subject_id: taskId, limit: 1 })).length).toBe(1);
    expect(isWarlogError(await failure(h.call('response_get', { id: '01J00000000000000000000099' })), 'NOT_FOUND')).toBe(true);
  });
});

describe.each(['lazy', 'live'] as const)('response promotion (%s index)', (mode) => {
  it('[WL-32] a list item becomes a guardrail memory that links back to the response', async () => {
    const h = trackerHarness({ mode });
    const { response } = await respond(h);
    const promoted = await h.obj('response_promote', { response_id: response['id'], question_id: 'improve', item_index: 1 });
    const memory = promoted['memory'] as Record<string, unknown>;
    expect(memory).toMatchObject({ kind: 'guardrail', title: 'merge earlier', content: 'merge earlier', scope: 'repo', status: 'active', links: [{ rel: 'derived_from', target: response['id'] }], tags: ['aar'] });
    expect(await h.rows('links_of', { id: response['id'], direction: 'in' })).toEqual([expect.objectContaining({ id: memory['id'], rel: 'derived_from', type: 'memory' })]);
    expect((await h.obj('memory_recall', { query: 'merge earlier' }))['count']).toBe(1);
    const text = await h.obj('response_promote', { response_id: response['id'], question_id: 'happened', kind: 'fact', scope: 'global', title: 'Stacked PRs' });
    expect(text['memory']).toMatchObject({ kind: 'fact', scope: 'global', title: 'Stacked PRs', content: 'three stacked PRs' });
    expect(h.activityRecords().at(-1)).toMatchObject({ entity_type: 'memory', action: 'created' });
  });

  it('[WL-32] answers of every shape can be promoted; missing answers and bad indexes are refused', async () => {
    const h = trackerHarness({ mode });
    const { response } = await respond(h);
    const id = response['id'];
    expect(isWarlogError(await failure(h.call('response_promote', { response_id: id, question_id: 'improve' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('response_promote', { response_id: id, question_id: 'improve', item_index: 5 })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('response_promote', { response_id: id, question_id: 'happened', item_index: 0 })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('response_promote', { response_id: id, question_id: 'nothing_here' })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('response_promote', { response_id: '01J00000000000000000000099', question_id: 'improve', item_index: 0 })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('response_promote', { response_id: id, question_id: 'improve', item_index: 0, kind: 'pattern' })), 'VALIDATION')).toBe(true);
    expect(promotableText(12, undefined)).toBe('12');
    expect(promotableText(false, undefined)).toBe('false');
    expect(promotableText({ lint: true, test: false }, 1)).toBe('test');
    expect(() => promotableText([], 0)).toThrow(/item_index is required/);
    expect(() => promotableText(undefined, undefined)).toThrow(/no answer/);
  });

  it('[WL-32] an untitled long lesson gets the first line, cut at 80 characters, as its title', async () => {
    const h = trackerHarness({ mode });
    const { response } = await respond(h, { ...AAR, improve: [`${'x'.repeat(100)}\nsecond line`] });
    const memory = (await h.obj('response_promote', { response_id: response['id'], question_id: 'improve', item_index: 0 }))['memory'] as Record<string, unknown>;
    expect(String(memory['title'])).toHaveLength(80);
    expect(memory['content']).toBe(`${'x'.repeat(100)}\nsecond line`);
    const outside = trackerHarness({ mode, withRepository: false });
    expect(isWarlogError(await failure(outside.call('response_promote', { response_id: response['id'], question_id: 'improve', item_index: 0 })), 'NOT_FOUND')).toBe(true);
  });
});

describe('no review trigger', () => {
  it('[WL-34] no operation decides when an AAR is opened: nothing schedules, triggers or opens reviews', () => {
    const names = productOperations(trackerHarness().deps()).map((d) => d.name);
    expect(names.filter((n) => /trigger|schedule|when|due|open_aar|start_aar|auto/.test(n))).toEqual([]);
    const responseOps = names.filter((n) => n.startsWith('response_') || n.startsWith('questionnaire_'));
    expect(responseOps.sort()).toEqual(['questionnaire_define', 'questionnaire_get', 'questionnaire_list', 'response_create', 'response_get', 'response_list', 'response_promote']);
    const inputs = productOperations(trackerHarness().deps())
      .filter((d) => responseOps.includes(d.name))
      .flatMap((d) => Object.keys(d.input.shape));
    expect(inputs.filter((k) => /trigger|policy|schedule|criteria/.test(k))).toEqual([]);
  });
});
