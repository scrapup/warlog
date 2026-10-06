import { describe, expect, it } from '@jest/globals';
import { isIsoDate } from '../../../../src/domain/questionnaire/types/answer-checks.ts';
import { QUESTION, QUESTION_TYPE_NAMES, checkAnswer, renderAnswer, typeFor } from '../../../../src/domain/questionnaire/question-type-registry.ts';
import { isQuestionId } from '../../../../src/domain/questionnaire/question.schema.ts';
import { assertQuestions } from '../../../../src/domain/questionnaire/questionnaire-rules.ts';
import type { Question } from '../../../../src/domain/questionnaire/question-type-registry.ts';
import { applies } from '../../../../src/domain/questionnaire/when-evaluator.ts';
import { answerProblems } from '../../../../src/domain/questionnaire/answer-validation.ts';
import { isWarlogError } from '../../../../src/core/errors/warlog-error.ts';

/**
 * Parses a question definition.
 * @param raw - Definition.
 * @returns The question.
 */
function q(raw: Record<string, unknown>): Question {
  return QUESTION.parse({ id: 'q', prompt: 'P', ...raw }) as Question;
}

describe('question types', () => {
  it('[WL-29] registers the ten types', () => {
    expect([...QUESTION_TYPE_NAMES].sort()).toEqual(['boolean', 'checklist', 'date', 'list', 'long_text', 'multi_choice', 'number', 'scale', 'single_choice', 'text']);
    expect(() => typeFor('video')).toThrow(/unknown question type/);
  });

  it('[WL-29] text and long_text: printable text within max_length (defaults 2 000 / 20 000)', () => {
    expect(checkAnswer(q({ type: 'text' }), 'ok')).toBeUndefined();
    expect(checkAnswer(q({ type: 'text' }), 5)).toBe('must be text');
    expect(checkAnswer(q({ type: 'text' }), 'x'.repeat(2_001))).toBe('must be at most 2000 characters');
    expect(checkAnswer(q({ type: 'text', max_length: 3 }), 'abcd')).toBe('must be at most 3 characters');
    expect(checkAnswer(q({ type: 'text' }), 'a\u0000b')).toBe('must not contain control characters');
    expect(checkAnswer(q({ type: 'long_text' }), 'x'.repeat(20_000))).toBeUndefined();
    expect(checkAnswer(q({ type: 'long_text' }), `${'x'.repeat(20_000)}y`)).toBe('must be at most 20000 characters');
    expect(checkAnswer(q({ type: 'long_text' }), 'multi\nline\ttext')).toBeUndefined();
    expect(renderAnswer(q({ type: 'long_text' }), 'a\nb')).toBe('a\nb');
  });

  it('[WL-29] single_choice: one of the options, or any text with allow_other', () => {
    const closed = q({ type: 'single_choice', options: ['a', 'b'] });
    expect(checkAnswer(closed, 'a')).toBeUndefined();
    expect(checkAnswer(closed, 'c')).toBe('must be one of a, b');
    expect(checkAnswer(closed, 1)).toBe('must be text');
    const open = q({ type: 'single_choice', options: ['a'], allow_other: true });
    expect(checkAnswer(open, 'something else')).toBeUndefined();
    expect(checkAnswer(open, '  ')).toBe('must be one of a');
    expect(renderAnswer(open, 'a')).toBe('a');
    expect(renderAnswer(open, 'zzz')).toBe('Other: zzz');
  });

  it('[WL-29] multi_choice: options, optional others, min and max, no repeats', () => {
    const question = q({ type: 'multi_choice', options: ['a', 'b', 'c'], min: 1, max: 2 });
    expect(checkAnswer(question, ['a', 'b'])).toBeUndefined();
    expect(checkAnswer(question, [])).toBe('needs at least 1 item(s)');
    expect(checkAnswer(question, ['a', 'b', 'c'])).toBe('allows at most 2 item(s)');
    expect(checkAnswer(question, ['a', 'a'])).toBe('must not repeat a choice');
    expect(checkAnswer(question, ['z'])).toBe('must be among a, b, c');
    expect(checkAnswer(question, 'a')).toBe('must be a list of choices');
    expect(checkAnswer(question, [3])).toBe('each choice must be text');
    expect(checkAnswer(q({ type: 'multi_choice', options: ['a'], allow_other: true }), ['a', 'x'])).toBeUndefined();
    expect(renderAnswer(q({ type: 'multi_choice', options: ['a'], allow_other: true }), ['a', 'x'])).toBe('- a\n- Other: x');
  });

  it('[WL-29] checklist: every item present and boolean, all ticked when require_all', () => {
    const question = q({ type: 'checklist', items: ['lint', 'test'] });
    expect(checkAnswer(question, { lint: true, test: false })).toBeUndefined();
    expect(checkAnswer(question, { lint: true })).toBe('must have exactly the items lint, test');
    expect(checkAnswer(question, { lint: true, test: true, extra: true })).toBe('must have exactly the items lint, test');
    expect(checkAnswer(question, { lint: 'yes', test: true })).toBe('must be an object of item: true/false');
    expect(checkAnswer(question, ['lint'])).toBe('must be an object of item: true/false');
    const all = q({ type: 'checklist', items: ['lint'], require_all: true });
    expect(checkAnswer(all, { lint: false })).toBe('every item must be ticked');
    expect(checkAnswer(all, { lint: true })).toBeUndefined();
    expect(renderAnswer(question, { lint: true, test: false })).toBe('- [x] lint\n- [ ] test');
  });

  it('[WL-29] list: texts within min_items and max_items', () => {
    const question = q({ type: 'list', min_items: 1, max_items: 2 });
    expect(checkAnswer(question, ['a', 'b'])).toBeUndefined();
    expect(checkAnswer(question, [])).toBe('needs at least 1 item(s)');
    expect(checkAnswer(question, ['a', 'b', 'c'])).toBe('allows at most 2 item(s)');
    expect(checkAnswer(question, ['a', ''])).toBe('each item must not be empty');
    expect(checkAnswer(question, ['a', 1])).toBe('each item must be text');
    expect(checkAnswer(question, 'a')).toBe('must be a list of texts');
    expect(checkAnswer(q({ type: 'list' }), Array.from({ length: 101 }, () => 'x'))).toBe('allows at most 100 item(s)');
    expect(renderAnswer(question, ['a', 'b'])).toBe('- a\n- b');
  });

  it('[WL-29] boolean: yes or no, nothing else', () => {
    const question = q({ type: 'boolean' });
    expect([checkAnswer(question, true), checkAnswer(question, false)]).toEqual([undefined, undefined]);
    expect(checkAnswer(question, 'yes')).toBe('must be true or false');
    expect(checkAnswer(question, 1)).toBe('must be true or false');
    expect([renderAnswer(question, true), renderAnswer(question, false)]).toEqual(['Yes', 'No']);
  });

  it('[WL-29] number: finite, optionally whole, within min and max', () => {
    const question = q({ type: 'number', min: 0, max: 10, integer: true });
    expect(checkAnswer(question, 5)).toBeUndefined();
    expect(checkAnswer(question, 5.5)).toBe('must be a whole number');
    expect(checkAnswer(question, -1)).toBe('must be at least 0');
    expect(checkAnswer(question, 11)).toBe('must be at most 10');
    expect(checkAnswer(question, '5')).toBe('must be a number');
    expect(checkAnswer(question, Number.NaN)).toBe('must be a number');
    expect(checkAnswer(q({ type: 'number' }), 1.5)).toBeUndefined();
    expect(renderAnswer(question, 7)).toBe('7');
  });

  it('[WL-29] scale: a whole number from min to max (default 1 to 5)', () => {
    expect(checkAnswer(q({ type: 'scale' }), 3)).toBeUndefined();
    expect(checkAnswer(q({ type: 'scale' }), 6)).toBe('must be a whole number from 1 to 5');
    expect(checkAnswer(q({ type: 'scale' }), 2.5)).toBe('must be a whole number from 1 to 5');
    const custom = q({ type: 'scale', min: 0, max: 10, min_label: 'none', max_label: 'all' });
    expect(checkAnswer(custom, 0)).toBeUndefined();
    expect(checkAnswer(custom, 11)).toBe('must be a whole number from 0 to 10');
    expect(renderAnswer(custom, 7)).toBe('7 / 10');
    expect(renderAnswer(q({ type: 'scale' }), 4)).toBe('4 / 5');
  });

  it('[WL-29] date: a real calendar date as YYYY-MM-DD', () => {
    const question = q({ type: 'date' });
    expect(checkAnswer(question, '2026-10-04')).toBeUndefined();
    expect(checkAnswer(question, '2024-02-29')).toBeUndefined();
    for (const bad of ['2026-02-30', '2026-13-01', '26-10-04', '2026-1-4', '2026/10/04', 'today', 20261004, '2026-10-0x']) {
      expect(checkAnswer(question, bad)).toBe('must be a date as YYYY-MM-DD');
    }
    expect(isIsoDate('2026-00-10')).toBe(false);
    expect(renderAnswer(question, '2026-10-04')).toBe('2026-10-04');
  });

  it('[WL-29] definitions are strict: unknown fields, bad parameters and bad ids are rejected', () => {
    for (const bad of [
      { type: 'text', extra: 1 },
      { type: 'video' },
      { type: 'single_choice' },
      { type: 'single_choice', options: ['a', 'a'] },
      { type: 'multi_choice', options: ['a'], min: 2, max: 1 },
      { type: 'list', min_items: 3, max_items: 1 },
      { type: 'number', min: 5, max: 1 },
      { type: 'scale', min: 5, max: 5 },
      { type: 'checklist', items: [] },
      { type: 'text', id: 'Bad-Id' },
      { type: 'text', prompt: '  ' },
      { type: 'text', when: { question: 'a' } },
      { type: 'text', when: { question: 'a', equals: 1, not_equals: 2 } },
    ]) {
      expect(QUESTION.safeParse({ id: 'q', prompt: 'P', ...bad }).success).toBe(false);
    }
    expect(isQuestionId('why_difference')).toBe(true);
    expect(isQuestionId('1abc')).toBe(false);
    expect(isQuestionId('')).toBe(false);
    expect(QUESTION.parse({ id: 'q', prompt: ' P ', type: 'boolean' })).toMatchObject({ prompt: 'P', required: false });
  });
});

describe('conditions', () => {
  it('[WL-30] a question applies when its condition on an earlier answer holds', () => {
    expect(applies(undefined, {})).toBe(true);
    expect(applies({ question: 'o', equals: 'a' }, { o: 'a' })).toBe(true);
    expect(applies({ question: 'o', equals: 'a' }, { o: 'b' })).toBe(false);
    expect(applies({ question: 'o', equals: 1 }, { o: '1' })).toBe(false);
    expect(applies({ question: 'o', not_equals: 'success' }, { o: 'failure' })).toBe(true);
    expect(applies({ question: 'o', not_equals: 'success' }, { o: 'success' })).toBe(false);
    expect(applies({ question: 'o', in: ['a', 'b'] }, { o: 'b' })).toBe(true);
    expect(applies({ question: 'o', in: ['a', 'b'] }, { o: 'c' })).toBe(false);
    expect(applies({ question: 'o', not_equals: 'x' }, {})).toBe(false);
    expect(applies({ question: 'o', equals: false }, { o: false })).toBe(true);
  });

  it('[WL-30] define-time checks: unique ids and conditions only on earlier questions', () => {
    const base = { prompt: 'P', required: false } as const;
    const ok = [
      { ...base, id: 'a', type: 'boolean' },
      { ...base, id: 'b', type: 'text', when: { question: 'a', equals: true } },
    ] as Question[];
    expect(() => assertQuestions(ok)).not.toThrow();
    const error = (() => {
      try {
        assertQuestions([{ ...base, id: 'b', type: 'text', when: { question: 'a', equals: true } }, { ...base, id: 'a', type: 'boolean' }, { ...base, id: 'a', type: 'boolean' }] as Question[]);
      } catch (e: unknown) {
        return e;
      }
      return undefined;
    })();
    expect(isWarlogError(error, 'VALIDATION') ? error.details?.['issues'] : undefined).toEqual([
      { path: 'questions.0.when.question', message: 'a is not an earlier question' },
      { path: 'questions.2.id', message: 'duplicate question id a' },
    ]);
  });

  it('[WL-31] answers: every problem is listed; unmet conditions are not asked; unknown ids are refused', () => {
    const questions = [
      { id: 'outcome', type: 'single_choice', prompt: 'O', required: true, options: ['success', 'failure'] },
      { id: 'why', type: 'long_text', prompt: 'W', required: true, when: { question: 'outcome', not_equals: 'success' } },
      { id: 'n', type: 'number', prompt: 'N', required: false, min: 1 },
      { id: 'items', type: 'list', prompt: 'I', required: true },
    ] as Question[];
    expect(answerProblems(questions, { outcome: 'success', items: ['x'] })).toEqual([]);
    expect(answerProblems(questions, { outcome: 'failure', items: [] })).toEqual([
      { path: 'answers.why', message: 'is required' },
      { path: 'answers.items', message: 'is required' },
    ]);
    expect(answerProblems(questions, { outcome: 'success', why: 'not asked', items: ['x'], n: 0, ghost: 1 })).toEqual([
      { path: 'answers.why', message: 'not applicable: why is asked only when its condition on outcome holds' },
      { path: 'answers.n', message: 'must be at least 1' },
      { path: 'answers.ghost', message: 'is not a question of this questionnaire' },
    ]);
    expect(answerProblems(questions, { outcome: 'failure', why: '   ', items: ['x'] })).toEqual([{ path: 'answers.why', message: 'is required' }]);
    expect(answerProblems([{ id: 'ok', type: 'boolean', prompt: 'P', required: true }] as Question[], { ok: false })).toEqual([]);
    expect(answerProblems([{ id: 'ok', type: 'boolean', prompt: 'P', required: true }] as Question[], { ok: null })).toEqual([{ path: 'answers.ok', message: 'is required' }]);
  });
});
