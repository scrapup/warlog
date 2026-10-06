/**
 * Builds the traceability matrix around a node.
 */
import { WarlogError } from '../../core/errors/warlog-error.ts';
import type { OperationContext } from '../../core/mediator/operation-context.ts';
import type { OperationHandler } from '../../core/mediator/operation-definition.ts';
import type { OperationResult } from '../../core/mediator/operation-result.ts';
import type { Row } from '../shared/rows.ts';
import { parseLinkTarget } from './link-target-parser.ts';
import { targetBrief } from './node-label.ts';
import type { TraceInput } from './trace.operation.ts';
import { walkTrace } from './trace-walker.ts';
import type { TraceRow } from './trace-walker.ts';

/** Matrix column of a node type. */
const COLUMNS: Readonly<Record<string, string>> = { spec: 'use_case', story: 'story', task: 'task', test: 'test', git: 'commit', external: 'external' };

/** Node types shown by their reference alone. */
const LABELLESS = new Set(['pending', 'git', 'spec', 'test']);

/** Matrix columns, in reading order. */
const COLUMN_ORDER = ['use_case', 'story', 'task', 'test', 'commit', 'external', 'other', 'pending'];

/**
 * Groups reached nodes by matrix column.
 * @param root - Root node brief.
 * @param rows - Rows of the walk.
 * @returns Labels per column (only non-empty columns).
 */
function matrixOf(root: Row, rows: readonly TraceRow[]): Record<string, string[]> {
  const matrix = new Map<string, string[]>();
  for (const node of [root, ...rows.map((r) => r.node)]) {
    const column = COLUMNS[String(node['type'])] ?? (node['pending'] === true ? 'pending' : 'other');
    matrix.set(column, [...(matrix.get(column) ?? []), nodeText(node)]);
  }
  return Object.fromEntries(COLUMN_ORDER.filter((c) => matrix.has(c)).map((c) => [c, matrix.get(c) ?? []]));
}

/**
 * Text of a node in the matrix: references and pending ids as they are, entities with their label.
 * @param node - Node brief.
 * @returns The text.
 */
function nodeText(node: Row): string {
  return LABELLESS.has(String(node['type'])) || node['pending'] === true ? String(node['id']) : `${String(node['id'])} ${String(node['label'])}`;
}

/** Handles `trace`. */
export class TraceHandler implements OperationHandler<TraceInput> {
  /**
   * Walks the graph and builds the matrix.
   * @param input - Validated input.
   * @param context - Call context.
   * @returns `{ root, depth, truncated, matrix, rows }`.
   * @throws {WarlogError} `NOT_FOUND` for an unknown entity id nothing links to.
   */
  async handle(input: TraceInput, context: OperationContext): Promise<OperationResult> {
    const view = await context.index.full();
    if (parseLinkTarget(input.id)?.kind === 'entity' && view.get(input.id) === undefined && view.backlinksOf(input.id).length === 0) {
      throw new WarlogError('NOT_FOUND', `entity ${input.id} not found`, { id: input.id });
    }
    const { rows, truncated } = walkTrace(view, input.id, input.depth);
    if (truncated) {
      context.warnings.push('trace.truncated');
    }
    const root = targetBrief(view, input.id);
    return {
      kind: 'object',
      value: {
        root,
        depth: input.depth,
        truncated,
        matrix: matrixOf(root, rows),
        rows: rows.map((r) => ({ depth: r.depth, rel: r.rel, direction: r.direction, from: r.from, ...r.node })),
      },
    };
  }
}
