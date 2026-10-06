/**
 * Sections of the playbook (WL-20): runbooks, commands by status in this environment, open known
 * issues and patterns, built from the memories in play.
 */
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { ActivitySummary, IndexedEntity, StoreView } from '../../core/ports/store-view.port.ts';
import { memoryFull, memoryRow, scopeOfMemory } from '../memory/memory-rows.ts';
import { text } from '../shared/rows.ts';
import type { Row } from '../shared/rows.ts';
import { deriveStatuses, statusHere } from './command-status-deriver.ts';

/** A memory kind's section entries. */
export type Section = readonly IndexedEntity[];

/** A command entry and the bucket it belongs to. */
export interface BucketedCommand {
  /** `works`, `fails`, `flaky` or `unverified`. */
  readonly bucket: string;
  /** The entry. */
  readonly entry: Row;
}

/**
 * Entry of a command: the memory, its status here and per environment.
 * @param commands - Observations per command memory.
 * @param context - Call context.
 * @param memory - Command memory.
 * @returns The entry and its bucket (`unverified` without observations).
 */
function commandEntry(commands: ActivitySummary['commands'], context: OperationContext, memory: IndexedEntity): BucketedCommand {
  const environments = deriveStatuses(commands.get(memory.id) ?? []);
  const here = statusHere(environments, context.runtime.os, context.runtime.node);
  const known = text(memory, 'known_error');
  return {
    bucket: here?.status ?? 'unverified',
    entry: {
      id: memory.id,
      scope: scopeOfMemory(memory),
      cmd: text(memory, 'cmd'),
      purpose: text(memory, 'purpose'),
      ...(here === undefined ? {} : { status: here.status, ...(here.elsewhere ? { observed_elsewhere: true } : {}) }),
      ...(known === '' ? {} : { known_error: known }),
      environments,
    },
  };
}

/**
 * Commands grouped by their status in the current environment.
 * @param observations - Observations per command memory.
 * @param context - Call context.
 * @param commands - Command memories.
 * @returns `{ works, fails, flaky, unverified }`.
 */
export function commandBuckets(observations: ActivitySummary['commands'], context: OperationContext, commands: Section): Record<string, Row[]> {
  const buckets: Record<string, Row[]> = { works: [], fails: [], flaky: [], unverified: [] };
  for (const memory of commands) {
    const { bucket, entry } = commandEntry(observations, context, memory);
    (buckets[bucket] as Row[]).push(entry);
  }
  return buckets;
}

/**
 * Runbook entries with their commands resolved.
 * @param view - View.
 * @param runbooks - Runbook memories.
 * @returns Entries with the steps.
 */
export function runbookEntries(view: StoreView, runbooks: Section): Row[] {
  return runbooks.map((r) => {
    const ids = Array.isArray(r.record.data['commands']) ? r.record.data['commands'].map(String) : [];
    const commands = ids.map((id) => {
      const found = view.get(id);
      return found === undefined ? { id, missing: true } : { id, cmd: text(found, 'cmd') };
    });
    return { ...memoryFull(r), ...(commands.length === 0 ? {} : { commands }) };
  });
}

/**
 * Rows of a section without bodies.
 * @param memories - Memories.
 * @returns Rows with excerpts.
 */
export function sectionRows(memories: Section): Row[] {
  return memories.map((m) => memoryRow(m));
}
