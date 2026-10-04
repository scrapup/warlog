/**
 * `doctor` (WL-45): health report of the store. CLI `warlog doctor`, MCP tool `doctor`.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import { DoctorHandler } from './doctor.handler.ts';

/** Input schema (no parameters). */
const DOCTOR_INPUT = z.object({});

/**
 * Builds the definition.
 * @returns The `doctor` operation.
 */
export function doctorOperation(): OperationDefinition {
  return {
    name: 'doctor',
    group: 'doctor',
    action: '',
    kind: 'query',
    input: DOCTOR_INPUT,
    description:
      'Report conflict copies, merge-conflicted and invalid files, pending links, broken document references, memories due for review and stale temp files. Never repairs anything.',
    examples: [{}],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new DoctorHandler(),
  };
}
