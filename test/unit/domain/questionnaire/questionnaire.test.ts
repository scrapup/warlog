import { describe, expect, it } from '@jest/globals';
import { join } from 'node:path';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';
import { AAR_QUESTIONS } from '../../../../src/domain/questionnaire/builtin/aar.questionnaire.ts';
import { norm } from '../../../support/fakes/path-map.ts';
import { trackerHarness } from '../../../support/tracker-harness.ts';
import type { TrackerHarness } from '../../../support/tracker-harness.ts';
import { container, failure } from '../../../support/tracker-setup.ts';

const SIMPLE = [
  { id: 'ready', type: 'boolean', prompt: 'Is the release ready?', required: true },
  { id: 'blockers', type: 'list', prompt: 'What blocks it?', when: { question: 'ready', equals: false } },
];

/**
 * Issues of a failed call.
 * @param h - Harness.
 * @param name - Operation.
 * @param input - Input.
 * @returns The issues.
 */
async function issues(h: TrackerHarness, name: string, input: Record<string, unknown>): Promise<unknown[]> {
  const error = await failure(h.call(name, input));
  return isWarlogError(error, 'VALIDATION') ? (error.details?.['issues'] as unknown[]) : [];
}

describe.each(['lazy', 'live'] as const)('questionnaires (%s index)', (mode) => {
  it('[WL-33] the built-in aar exists before any file: outcome, trigger, expected, happened, why, sustain, improve', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    const aar = await h.obj('questionnaire_get', { slug: 'aar' });
    expect(aar).toMatchObject({ slug: 'aar', title: 'After-Action Review', version: 1, scope: 'global', builtin: true });
    const questions = aar['questions'] as Record<string, unknown>[];
    expect(questions.map((x) => [x['id'], x['type'], x['required']])).toEqual([
      ['outcome', 'single_choice', true],
      ['trigger', 'text', true],
      ['expected', 'long_text', true],
      ['happened', 'long_text', true],
      ['why_difference', 'long_text', true],
      ['sustain', 'list', false],
      ['improve', 'list', false],
    ]);
    expect(questions[0]).toMatchObject({ options: ['success', 'partial', 'failure'] });
    expect(questions[4]).toMatchObject({ when: { question: 'outcome', not_equals: 'success' } });
    expect(AAR_QUESTIONS).toHaveLength(7);
    expect((await h.rows('questionnaire_list')).map((r) => [r['slug'], r['scope'], r['questions'], r['builtin']])).toEqual([['aar', 'global', 7, true]]);
    expect([...h.fs.files.keys()].some((p) => p.includes('questionnaires'))).toBe(false);
  });

  it('[WL-29] questionnaire_define stores a versioned questionnaire; redefining bumps the version', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    expect(await h.obj('questionnaire_define', { slug: 'release-check', title: 'Release check', description: 'Before tagging', questions: SIMPLE })).toEqual({ slug: 'release-check', scope: 'repo', version: 1, title: 'Release check', questions: 2, created: true });
    expect([...h.fs.files.keys()].some((p) => p.endsWith(norm(join('.warlog', 'questionnaires', 'release-check.md'))))).toBe(true);
    expect(await h.obj('questionnaire_define', { slug: 'release-check', title: 'Release check v2', questions: [SIMPLE[0]] })).toMatchObject({ version: 2, questions: 1, created: false });
    const got = await h.obj('questionnaire_get', { slug: 'release-check' });
    expect(got).toMatchObject({ slug: 'release-check', title: 'Release check v2', version: 2, scope: 'repo' });
    expect(got).not.toHaveProperty('description');
    expect((got['questions'] as unknown[]).length).toBe(1);
    expect(await h.obj('questionnaire_define', { slug: 'release-check', title: 't', questions: SIMPLE })).toMatchObject({ version: 3 });
    expect(h.activityRecords().at(-1)).toMatchObject({ entity_type: 'questionnaire', entity_id: 'release-check', action: 'updated', new_value: '3' });
    expect((await h.obj('questionnaire_get', { slug: 'release-check' }))['description']).toBeUndefined();
  });

  it('[WL-29] a repository questionnaire overrides a global one of the same slug', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    await h.call('questionnaire_define', { slug: 'check', title: 'Global check', scope: 'global', questions: [SIMPLE[0]] });
    expect(await h.obj('questionnaire_get', { slug: 'check' })).toMatchObject({ title: 'Global check', scope: 'global' });
    await h.call('questionnaire_define', { slug: 'check', title: 'Repo check', questions: SIMPLE });
    expect(await h.obj('questionnaire_get', { slug: 'check' })).toMatchObject({ title: 'Repo check', scope: 'repo', version: 1 });
    expect(await h.obj('questionnaire_get', { slug: 'check', scope: 'global' })).toMatchObject({ title: 'Global check', scope: 'global' });
    expect((await h.rows('questionnaire_list')).map((r) => [r['slug'], r['scope']])).toEqual([
      ['check', 'repo'],
      ['aar', 'global'],
    ]);
    expect((await h.rows('questionnaire_list', { scope: 'global' })).map((r) => r['slug']).sort()).toEqual(['aar', 'check']);
    expect((await h.view()).excluded.invalidFiles()).toEqual([]);
  });

  it('[WL-30] defining rejects duplicate ids, conditions on later questions and malformed questions', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    expect(await issues(h, 'questionnaire_define', { slug: 'x', title: 't', questions: [{ id: 'b', type: 'text', prompt: 'B', when: { question: 'a', equals: 1 } }, { id: 'a', type: 'text', prompt: 'A' }, { id: 'a', type: 'text', prompt: 'A2' }] })).toEqual([
      { path: 'questions.0.when.question', message: 'a is not an earlier question' },
      { path: 'questions.2.id', message: 'duplicate question id a' },
    ]);
    expect(isWarlogError(await failure(h.call('questionnaire_define', { slug: 'x', title: 't', questions: [{ id: 'a', type: 'video', prompt: 'A' }] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('questionnaire_define', { slug: 'x', title: 't', questions: [] })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('questionnaire_define', { slug: 'Bad Slug', title: 't', questions: SIMPLE })), 'VALIDATION')).toBe(true);
    expect(isWarlogError(await failure(h.call('questionnaire_get', { slug: 'nope' })), 'NOT_FOUND')).toBe(true);
    expect(isWarlogError(await failure(h.call('questionnaire_get', { slug: 'aar', scope: 'repo' })), 'NOT_FOUND')).toBe(true);
  });

  it('[WL-29] outside a repository questionnaires are global; repository scope needs a repository', async () => {
    const h = trackerHarness({ mode, withRepository: false });
    expect(await h.obj('questionnaire_define', { slug: 'g', title: 'G', questions: SIMPLE })).toMatchObject({ scope: 'global' });
    expect((await h.rows('questionnaire_list')).map((r) => r['slug']).sort()).toEqual(['aar', 'g']);
    expect(isWarlogError(await failure(h.call('questionnaire_define', { slug: 'r', title: 'R', scope: 'repo', questions: SIMPLE })), 'NO_REPO_CONTEXT')).toBe(true);
  });

  it('[WL-33] redefining the built-in aar writes a global file at version 2; a hand-edited bad file is INVALID_FILE', async () => {
    const h = trackerHarness({ mode });
    await container(h);
    expect(await h.obj('questionnaire_define', { slug: 'aar', title: 'Our AAR', scope: 'global', questions: [{ id: 'outcome', type: 'text', prompt: 'Outcome?', required: true }] })).toMatchObject({ version: 2, created: true });
    expect(await h.obj('questionnaire_get', { slug: 'aar' })).toMatchObject({ title: 'Our AAR', version: 2 });
    expect((await h.rows('questionnaire_list')).filter((r) => r['slug'] === 'aar')).toEqual([expect.objectContaining({ questions: 1 })]);
    const path = [...h.fs.files.keys()].find((p) => p.endsWith(norm(join('questionnaires', 'aar.md'))));
    h.fs.files.set(String(path), String(h.fs.files.get(String(path))).replace('type: text', 'type: video'));
    expect(isWarlogError(await failure(h.call('questionnaire_get', { slug: 'aar' })), 'INVALID_FILE')).toBe(true);
    expect((await h.rows('questionnaire_list')).map((r) => r['slug'])).toEqual(['aar']);
  });
});
