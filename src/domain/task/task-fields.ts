/**
 * Input pieces of the task operations (plan §1.1: same names and enums as the current tracker).
 */
import { z } from 'zod';

/** Location in source code a task refers to. */
export const SOURCE_REF = z
  .object({
    file: z.string().min(1).max(1024),
    line_start: z.number().int().min(1).optional(),
    line_end: z.number().int().min(1).optional(),
    repo: z.string().max(1024).optional().describe('Repository URL or name'),
    commit: z.string().max(64).optional().describe('Commit hash'),
  })
  .strict()
  .describe('Code location this task refers to');

/** A task code (e.g. `TF-12-01`). */
export const TASK_CODE = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => [...v].every((c) => /[A-Za-z0-9._-]/.test(c)), 'letters, digits, ".", "_" or "-"')
  .describe('Task code (e.g. TF-12-01)');

/** A due date (`YYYY-MM-DD`). */
export const DUE_DATE = z.string().max(32).describe('Due date (YYYY-MM-DD)');

/** Hours (estimate or actual). */
export const HOURS = z.number().min(0).max(100_000);
