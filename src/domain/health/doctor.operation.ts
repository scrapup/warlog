/**
 * `doctor` (WL-45): health report of the store. CLI `warlog doctor`, MCP tool `doctor`.
 */
import { z } from 'zod';
import type { OperationDefinition } from '../../core/mediator/operation-definition.ts';
import type { Logger } from '../../core/ports/logger.port.ts';
import type { ReferenceChecker } from '../doc/reference-checker.ts';
import { DoctorHandler } from './doctor.handler.ts';

/** Input schema (no parameters). */
const DOCTOR_INPUT = z.object({});

/**
 * Builds the definition.
 * @param logger - Logger for failed probes.
 * @param references - Looks for changed or broken document references.
 * @returns The `doctor` operation.
 */
export function doctorOperation(logger: Logger, references: ReferenceChecker): OperationDefinition {
  return {
    name: 'doctor',
    group: 'doctor',
    action: '',
    kind: 'query',
    input: DOCTOR_INPUT,
    description:
      'Report conflict copies, merge-conflicted and invalid files, pending links, referenced documents that changed or disappeared, memories not recalled for 90 days and stale temp files. Never repairs anything.',
    examples: [{}],
    defaultFormat: 'yaml',
    load: 'full',
    handler: new DoctorHandler(logger, references),
  };
}
