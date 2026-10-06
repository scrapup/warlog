/**
 * The built-in After-Action Review questionnaire (WL-33): outcome, trigger, what was expected,
 * what happened, why the difference, what to sustain and what to improve. It is a code constant
 * until a global file `aar` exists, which then takes over (an edit is a normal redefinition).
 */
import type { Question } from '../question-type-registry.ts';

/** Slug of the built-in questionnaire. */
export const AAR_SLUG = 'aar';

/** Version of the built-in questionnaire. */
export const AAR_VERSION = 1;

/** Title of the built-in questionnaire. */
export const AAR_TITLE = 'After-Action Review';

/** Questions of the built-in questionnaire. */
export const AAR_QUESTIONS: readonly Question[] = [
  { id: 'outcome', type: 'single_choice', prompt: 'What was the outcome?', required: true, options: ['success', 'partial', 'failure'], help: 'Judge against the intent that was stated, not against what happened to be easy.' },
  { id: 'trigger', type: 'text', prompt: 'What triggered this review?', required: true, help: 'The event or criterion that opened it (a milestone, a failure, a surprise).' },
  { id: 'expected', type: 'long_text', prompt: 'What did we expect to happen?', required: true },
  { id: 'happened', type: 'long_text', prompt: 'What actually happened?', required: true, help: 'Facts only: what was observed, in order.' },
  { id: 'why_difference', type: 'long_text', prompt: 'Why was there a difference?', required: true, when: { question: 'outcome', not_equals: 'success' }, help: 'Causes, not blame.' },
  { id: 'sustain', type: 'list', prompt: 'What should we sustain?', required: false, help: 'Things that worked and should be repeated.' },
  { id: 'improve', type: 'list', prompt: 'What should we improve?', required: false, help: 'Concrete changes for next time; promote the strongest to memories.' },
];
