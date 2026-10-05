/**
 * Builds entity changes from update inputs: fields the caller sent become the patch, the
 * description becomes the body, and tracked fields that changed become activity records
 * (`status` → `status_changed`, others → `updated`).
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { EntityChange } from '../../core/storage/entity-file-repository.ts';
import type { EntityRecord } from '../../core/storage/entity-ref.ts';
import type { ActivityEvent } from './tracker-writer.ts';

/** How an update input maps to the entity. */
export interface ChangeSpec {
  /** Input fields copied to the front matter when present. */
  readonly fields: readonly string[];
  /** Input field holding the new body. */
  readonly bodyField: string;
  /** Fields whose change is recorded in the activity log. */
  readonly tracked: readonly string[];
}

/**
 * Builds the change of an update.
 * @param input - Parsed input.
 * @param spec - Field mapping.
 * @returns The change.
 * @throws {WarlogError} `VALIDATION` when no field is set.
 */
export function changeFrom(input: Readonly<Record<string, unknown>>, spec: ChangeSpec): EntityChange {
  const patch = Object.fromEntries(spec.fields.filter((f) => input[f] !== undefined).map((f) => [f, input[f]]));
  const body = input[spec.bodyField];
  if (Object.keys(patch).length === 0 && body === undefined) {
    throw new WarlogError('VALIDATION', 'No fields to update', { fields: [...spec.fields, spec.bodyField] });
  }
  return typeof body === 'string' ? { patch, body } : { patch };
}

/**
 * Stringifies a field value for the activity log.
 * @param value - Value.
 * @returns Text (`''` when absent).
 */
function asText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Activity records of an update: one per tracked field that changed, or a single `updated`
 * record when none did.
 * @param label - Entity label (`task 'Title'`).
 * @param before - Record before the change.
 * @param patch - Fields set.
 * @param tracked - Fields recorded.
 * @returns The records.
 */
export function changeEvents(label: string, before: EntityRecord, patch: Readonly<Record<string, unknown>>, tracked: readonly string[]): ActivityEvent[] {
  const events = trackedChanges(label, before, patch, tracked);
  return events.length > 0 ? events : [{ action: 'updated', summary: `${label} updated` }];
}

/**
 * Activity records of the tracked fields that changed.
 * @param label - Entity label.
 * @param before - Record before the change.
 * @param patch - Fields set.
 * @param tracked - Fields recorded.
 * @returns One record per changed field.
 */
function trackedChanges(label: string, before: EntityRecord, patch: Readonly<Record<string, unknown>>, tracked: readonly string[]): ActivityEvent[] {
  return tracked
    .filter((f) => f in patch && asText(patch[f]) !== asText(before.data[f]))
    .map((f) => {
      const oldValue = asText(before.data[f]);
      const newValue = asText(patch[f]);
      return {
        action: f === 'status' ? 'status_changed' : 'updated',
        summary: `${label} ${f}: ${oldValue} -> ${newValue}`,
        extra: { field: f, old_value: oldValue, new_value: newValue },
      };
    });
}
