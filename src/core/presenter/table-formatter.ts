/**
 * Compact Markdown tables for lists (WL-38): the cheapest form for an agent's context.
 */

/**
 * Renders one cell: arrays joined, objects as JSON, `|` escaped, newlines flattened.
 * @param value - Cell value.
 * @returns Cell text.
 */
export function formatCell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) {
    text = '';
  } else if (Array.isArray(value)) {
    text = value.map((v) => formatCell(v)).join(', ');
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  return text.split('|').join('\\|').split('\r').join('').split('\n').join(' ');
}

/**
 * Renders rows as a Markdown table (columns in order of first appearance).
 * @param rows - Rows.
 * @returns The table, or `(no rows)`.
 */
export function formatTable(rows: readonly Readonly<Record<string, unknown>>[]): string {
  if (rows.length === 0) {
    return '(no rows)';
  }
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [`| ${columns.join(' | ')} |`, `|${columns.map(() => '---').join('|')}|`];
  for (const row of rows) {
    lines.push(`| ${columns.map((c) => formatCell(row[c])).join(' | ')} |`);
  }
  return lines.join('\n');
}
