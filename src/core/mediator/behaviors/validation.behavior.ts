/**
 * Validates the raw input against the operation's strict schema (SEC-23: unknown keys and
 * wrong types are rejected, never passed through).
 */
import type { z } from 'zod';
import { WarlogError } from '../../errors/warlog-error.ts';
import type { OperationResult } from '../operation-result.ts';
import type { Behavior, Next, PipelineRequest } from '../pipeline.ts';

/** One validation problem. */
export interface ValidationIssue {
  /** Dotted field path (`` for the input itself). */
  readonly path: string;
  /** What is wrong. */
  readonly message: string;
}

/**
 * Lists the problems of a failed parse; an unknown key becomes one issue at that key's path, so
 * transports can point at it.
 * @param error - zod error.
 * @returns The issues.
 */
export function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.flatMap((i) => {
    const keys = i.code === 'unrecognized_keys' ? i.keys : [undefined];
    return keys.map((key) => ({
      path: (key === undefined ? i.path : [...i.path, key]).join('.'),
      message: key === undefined ? i.message : 'unknown field',
    }));
  });
}

/** Rejects invalid input with every problem listed. */
export class ValidationBehavior implements Behavior {
  /** Applies to every operation. */
  readonly appliesTo = 'both';

  /**
   * Validates, then continues with the parsed input.
   * @param request - Call state.
   * @param next - Rest of the pipeline.
   * @returns The result.
   * @throws {WarlogError} `VALIDATION` with `issues` (field paths and messages).
   */
  async handle(request: PipelineRequest, next: Next): Promise<OperationResult | undefined> {
    const parsed = request.definition.input.strict().safeParse(request.raw ?? {});
    if (!parsed.success) {
      throw new WarlogError('VALIDATION', `invalid input for ${request.definition.name}`, { issues: toIssues(parsed.error) });
    }
    request.input = parsed.data;
    return next();
  }
}
