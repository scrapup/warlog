/**
 * Template input pieces (same shape as the current tracker).
 */
import { z } from 'zod';
import { PRIORITIES, TAGS, TITLE } from '../shared/fields.ts';
import { HOURS } from '../task/task-fields.ts';

/** One task of a template. */
export const TEMPLATE_TASK = z
  .object({
    title: TITLE.describe('Task title ({variable} placeholders allowed)'),
    description: z.string().max(200_000).optional().describe('Task description ({variable} placeholders allowed)'),
    priority: z.enum(PRIORITIES).default('medium').describe('Priority'),
    estimated_hours: HOURS.optional().describe('Estimated hours'),
    tags: TAGS,
  })
  .strict();

/** The tasks of a template (at least one). */
export const TEMPLATE_TASKS = z.array(TEMPLATE_TASK).min(1).max(500);

/** A template task as stored. */
export type TemplateTask = z.infer<typeof TEMPLATE_TASK>;
